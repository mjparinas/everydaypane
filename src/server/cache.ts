import "server-only";

import { query, run } from "./db";

// Upstream data (weather, air, calendars, garbage) is fetched by the server and kept twice: in memory for the
// instance's lifetime and in the cache table so a cold start doesn't refetch. When an upstream fails, the last good
// copy is served (with its age), so a display never goes blank because a free API had a bad minute.

const memory = new Map<string, { value: unknown; fetchedAt: number }>();
const inflight = new Map<string, Promise<unknown>>();

export interface Cached<T> {
  value: T;
  fetchedAt: number;
  stale: boolean;
}

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, now = Date.now()): Promise<Cached<T>> {
  let hit = memory.get(key);
  if (!hit) {
    const rows = await query<{ json: string; fetched_at: number }>("SELECT json, fetched_at FROM cache WHERE key = ?", [key]);
    const row = rows[0];
    if (row) {
      hit = { value: JSON.parse(row.json) as unknown, fetchedAt: Number(row.fetched_at) };
      memory.set(key, hit);
    }
  }
  if (hit && now - hit.fetchedAt < ttlMs) return { value: hit.value as T, fetchedAt: hit.fetchedAt, stale: false };
  try {
    let pending = inflight.get(key) as Promise<T> | undefined;
    if (!pending) {
      pending = load();
      inflight.set(key, pending);
    }
    const value = await pending;
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
    inflight.delete(key);
  }
}

/** Forgets a cached entry (after the admin changes the settings it was fetched with). */
export async function forget(prefix: string): Promise<void> {
  for (const k of memory.keys()) if (k.startsWith(prefix)) memory.delete(k);
  await run("DELETE FROM cache WHERE key LIKE ?", [`${prefix}%`]);
}

/** Tests only. */
export function clearMemoryCache(): void {
  memory.clear();
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
