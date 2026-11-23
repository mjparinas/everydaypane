import "server-only";

import { query, run } from "./db";

// Upstream data (weather, air, calendars, garbage) is fetched by the server and kept twice: in memory for the
// instance's lifetime and in the cache table so a cold start doesn't refetch. When an upstream fails, the last good
// copy is served (with its age), so a display never goes blank because a free API had a bad minute.

const memory = new Map<string, { value: unknown; fetchedAt: number }>();
const inflight = new Map<string, { gen: number; promise: Promise<unknown> }>();
/** Bumps when an entry is forgotten, so a load that started before that isn't written back. */
const generation = new Map<string, number>();

export interface Cached<T> {
  value: T;
  fetchedAt: number;
  stale: boolean;
}

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, now = Date.now()): Promise<Cached<T>> {
  let gen = generation.get(key) ?? 0;
  let hit = memory.get(key);
  if (!hit) {
    const rows = await query<{ json: string; fetched_at: number }>("SELECT json, fetched_at FROM cache WHERE key = ?", [key]);
    if ((generation.get(key) ?? 0) === gen) {
      const row = rows[0];
      if (row) {
        hit = { value: JSON.parse(row.json) as unknown, fetchedAt: Number(row.fetched_at) };
        memory.set(key, hit);
      }
    }
  }
  if (hit && now - hit.fetchedAt < ttlMs && (generation.get(key) ?? 0) === gen)
    return { value: hit.value as T, fetchedAt: hit.fetchedAt, stale: false };
  let flight: { gen: number; promise: Promise<unknown> } | undefined;
  try {
    gen = generation.get(key) ?? 0;
    const existing = inflight.get(key);
    // Join a load from this generation only. A forget bumps the generation, so the old promise is left alone.
    if (existing && existing.gen === gen) flight = existing;
    else {
      flight = { gen, promise: load() };
      inflight.set(key, flight);
    }
    const value = (await flight.promise) as T;
    if ((generation.get(key) ?? 0) !== gen) {
      // Forgotten while this load was in flight: don't write it back over the forget.
      const stale = memory.get(key) ?? hit;
      if (stale) return { value: stale.value as T, fetchedAt: stale.fetchedAt, stale: true };
      return { value, fetchedAt: now, stale: true };
    }
    memory.set(key, { value, fetchedAt: now });
    await run(
      "INSERT INTO cache (key, json, fetched_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET json = excluded.json, fetched_at = excluded.fetched_at",
      [key, JSON.stringify(value), now],
    );
    return { value, fetchedAt: now, stale: false };
  } catch (error) {
    if (hit) return { value: hit.value as T, fetchedAt: hit.fetchedAt, stale: true };
    throw error;
  } finally {
    // A newer load may already own the slot; only the promise that set it may clear it.
    if (flight && inflight.get(key)?.promise === flight.promise) inflight.delete(key);
  }
}

/** Forgets a cached entry (after the admin changes the settings it was fetched with). */
export async function forget(prefix: string): Promise<void> {
  const keys = new Set<string>([...memory.keys(), ...inflight.keys()]);
  for (const k of keys) {
    if (!k.startsWith(prefix)) continue;
    memory.delete(k);
    generation.set(k, (generation.get(k) ?? 0) + 1);
  }
  await run("DELETE FROM cache WHERE key LIKE ?", [`${prefix}%`]);
}

/** Tests only. */
export function clearMemoryCache(): void {
  memory.clear();
  inflight.clear();
  generation.clear();
}

export async function getJson(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<unknown> {
  const r = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": "Everydaypane/1.0", ...(init.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}`);
  return r.json() as Promise<unknown>;
}
