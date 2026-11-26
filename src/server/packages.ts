import "server-only";

import type { DashboardConfig } from "@/lib/config/schema";
import type { PackageCarrier, PackagesData, PackageTrack } from "@/lib/display/types";
import { CARRIER_17TRACK, statusFrom17, timeFrom17 } from "@/lib/packages";

import { cached, forget } from "./cache";
import { query, run } from "./db";
import { getSecret, setSecret } from "./secrets";

// Package tracking (Melvin, 2026-11-26: "package tracking for today's deliveries"; native cloud API, not Home
// Assistant). 17TRACK's tracking API v2.2 (api.17track.net/track/v2.2, header `17token`) with the household's own key
// from 17track.net's API dashboard, saved encrypted from Settings › Packages (`packages.17track`). 17TRACK tracks a
// number only once it is registered: registering uses one of the key's quota, so each number is registered once and
// remembered per household; reading its status (`gettrackinfo`) is free. One read every 15 minutes per household,
// shared by every display. Setup: docs/packages.md.

const BASE = "https://api.17track.net/track/v2.2";
const TTL = 15 * 60_000;
/** 17TRACK takes up to 40 numbers a call; a widget holds 12 and a household rarely has more than a few widgets. */
const CHUNK = 40;

export class TrackRefused extends Error {}

interface Answer {
  code?: number;
  data?: {
    accepted?: { number?: unknown; carrier?: unknown; track_info?: unknown }[];
    rejected?: { number?: unknown; error?: { code?: unknown; message?: unknown } }[];
  } & Record<string, unknown>;
}

async function call(key: string, path: string, body: unknown): Promise<Answer> {
  const r = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: { "17token": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (r.status === 401 || r.status === 403) throw new TrackRefused(`17TRACK answered ${r.status}`);
  if (!r.ok) throw new Error(`17TRACK answered ${r.status}`);
  const answer = (await r.json()) as Answer;
  // A bad key comes back as a 200 with a non-zero code (its message names the token).
  if (typeof answer.code === "number" && answer.code !== 0) {
    const text = JSON.stringify(answer.data ?? "").toLowerCase();
    if (text.includes("token") || text.includes("key") || text.includes("auth")) throw new TrackRefused(`17TRACK code ${answer.code}`);
    throw new Error(`17TRACK code ${answer.code}`);
  }
  return answer;
}

const keyFor = (accountId: string) => getSecret(accountId, "packages.17track");
const prefix = (accountId: string) => `packages:${accountId}:`;
const registeredKey = (accountId: string) => `${prefix(accountId)}registered`;

/** Numbers this household's key has registered, with the carrier 17TRACK settled on (0 = worked out each time). */
async function registered(accountId: string): Promise<Record<string, number>> {
  const rows = await query<{ json: string }>("SELECT json FROM cache WHERE key = ?", [registeredKey(accountId)]);
  try {
    return rows[0] ? (JSON.parse(rows[0].json) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

async function saveRegistered(accountId: string, map: Record<string, number>, now: number): Promise<void> {
  await run(
    "INSERT INTO cache (key, json, fetched_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET json = excluded.json, fetched_at = excluded.fetched_at",
    [registeredKey(accountId), JSON.stringify(map), now],
  );
}

const chunks = <T>(list: T[]): T[][] =>
  Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, i * CHUNK + CHUNK));

/** 17TRACK's "already registered" error: the number is ours already. */
const ALREADY = -18019901;

/**
 * Registers numbers not yet registered. A number refused with the carrier picked on the widget is tried again
 * without one, so a wrong pick (or a carrier number 17TRACK has changed) still gets tracked. Returns why 17TRACK
 * refused any that are left.
 */
async function register(
  key: string,
  wanted: { number: string; carrier: number }[],
  map: Record<string, number>,
): Promise<Map<string, string>> {
  const refused = new Map<string, string>();
  let retry: { number: string; carrier: number }[] = [];
  const send = async (list: { number: string; carrier: number }[], last: boolean) => {
    for (const part of chunks(list)) {
      const answer = await call(
        key,
        "register",
        part.map((n) => (n.carrier ? { number: n.number, carrier: n.carrier } : { number: n.number })),
      );
      for (const a of answer.data?.accepted ?? []) {
        if (typeof a.number === "string") map[a.number] = typeof a.carrier === "number" ? a.carrier : 0;
      }
      for (const r of answer.data?.rejected ?? []) {
        if (typeof r.number !== "string") continue;
        const asked = part.find((n) => n.number === r.number);
        if (r.error?.code === ALREADY) map[r.number] = asked?.carrier ?? 0;
        else if (!last && asked?.carrier) retry.push({ number: r.number, carrier: 0 });
        else refused.set(r.number, typeof r.error?.message === "string" ? r.error.message : "17TRACK couldn't track this number");
      }
    }
  };
  await send(wanted, false);
  const again = retry;
  retry = [];
  if (again.length) await send(again, true);
  return refused;
}

type Tracked = Pick<PackageTrack, "status" | "summary" | "where" | "eventAt" | "etaFrom" | "etaTo" | "deliveredAt">;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** One `track_info`, read leniently: 17TRACK leaves out what a carrier doesn't send. */
export function trackOf(info: unknown): Tracked {
  const t = obj(info);
  const latest = obj(t.latest_status);
  const event = obj(t.latest_event);
  const eta = obj(obj(t.time_metrics).estimated_delivery_date);
  const status = statusFrom17(latest.status);
  const eventAt = timeFrom17(event.time_utc) ?? timeFrom17(event.time_iso);
  const etaFrom = timeFrom17(eta.from);
  const etaTo = timeFrom17(eta.to);
  const where = str(event.location);
  const summary =
    str(event.description) ??
    (latest.status === "NotFound" ? "Waiting for the carrier's first scan" : status === "unknown" ? "No update yet" : "On its way");
  return {
    status,
    summary: summary.slice(0, 120),
    ...(where ? { where: where.slice(0, 60) } : {}),
    ...(eventAt !== undefined ? { eventAt } : {}),
    ...(etaFrom !== undefined ? { etaFrom } : {}),
    ...(etaTo !== undefined && etaTo !== etaFrom ? { etaTo } : {}),
    ...(status === "delivered" && eventAt !== undefined ? { deliveredAt: eventAt } : {}),
  };
}

interface WidgetPackage {
  id: string;
  carrier: PackageCarrier;
  trackingNumber: string;
  label?: string;
}

const packagesOn = (config: DashboardConfig): WidgetPackage[] => {
  const map = new Map<string, WidgetPackage>();
  for (const view of config.views)
    for (const w of view.widgets) {
      if (w.type !== "packages") continue;
      for (const p of w.packages)
        map.set(p.id, { id: p.id, carrier: p.carrier, trackingNumber: p.trackingNumber.replace(/\s+/g, "").toUpperCase(), label: p.label });
    }
  return [...map.values()];
};

async function readAll(accountId: string, key: string, items: WidgetPackage[], now: number): Promise<Map<string, Tracked>> {
  const map = await registered(accountId);
  const numbers = [...new Map(items.map((p) => [p.trackingNumber, CARRIER_17TRACK[p.carrier] ?? 0])).entries()];
  const missing = numbers.filter(([n]) => !(n in map)).map(([number, carrier]) => ({ number, carrier }));
  const refused = missing.length ? await register(key, missing, map) : new Map<string, string>();
  const out = new Map<string, Tracked>();
  for (const [n, why] of refused) out.set(n, { status: "exception", summary: why.slice(0, 120) });
  const ready = numbers.filter(([n]) => n in map).map(([number]) => ({ number, carrier: map[number] ?? 0 }));
  let lost = false;
  for (const part of chunks(ready)) {
    const answer = await call(
      key,
      "gettrackinfo",
      part.map((n) => (n.carrier ? { number: n.number, carrier: n.carrier } : { number: n.number })),
    );
    for (const a of answer.data?.accepted ?? []) if (typeof a.number === "string") out.set(a.number, trackOf(a.track_info));
    // Not registered after all (deleted on 17TRACK's dashboard, say): register it on the next read.
    for (const r of answer.data?.rejected ?? [])
      if (typeof r.number === "string") {
        delete map[r.number];
        lost = true;
      }
  }
  if (missing.length || lost) await saveRegistered(accountId, map, now);
  return out;
}

/** Status for every number on the household's Packages widgets (one shared feed). */
export async function packagesFeed(
  accountId: string,
  config: DashboardConfig,
  now = Date.now(),
): Promise<PackagesData & { stale?: boolean }> {
  const items = packagesOn(config);
  const key = await keyFor(accountId);
  const plain = (summary: string): PackageTrack[] =>
    items.map((p) => ({
      id: p.id,
      carrier: p.carrier,
      trackingNumber: p.trackingNumber,
      ...(p.label ? { label: p.label } : {}),
      status: "unknown",
      summary,
    }));
  if (!key) return { updatedAt: now, trackingConfigured: false, packages: plain("") };
  if (!items.length) return { updatedAt: now, trackingConfigured: true, packages: [] };
  const numbers = items.map((p) => `${p.carrier}:${p.trackingNumber}`).sort();
  try {
    const r = await cached(
      `${prefix(accountId)}feed:${numbers.join(",")}`,
      TTL,
      async () => Object.fromEntries(await readAll(accountId, key, items, now)),
      now,
    );
    const packages = items.map((p): PackageTrack => {
      const hit = r.value[p.trackingNumber];
      return {
        id: p.id,
        carrier: p.carrier,
        trackingNumber: p.trackingNumber,
        ...(p.label ? { label: p.label } : {}),
        ...(hit ?? { status: "unknown", summary: "No update yet" }),
        updatedAt: r.fetchedAt,
      };
    });
    return { updatedAt: r.fetchedAt, trackingConfigured: true, packages, ...(r.stale ? { stale: true } : {}) };
  } catch (e) {
    if (!(e instanceof TrackRefused)) console.error("[packages] 17TRACK failed", e);
    return {
      updatedAt: now,
      trackingConfigured: true,
      error: e instanceof TrackRefused ? "17TRACK refused the API key. Check it in Settings › Packages." : "Couldn't reach 17TRACK",
      packages: plain(""),
    };
  }
}

export interface TrackQuota {
  /** Registrations left on the key, when 17TRACK says. */
  remaining?: number;
  total?: number;
}

/** Checks a key (and reads what's left of its quota) without spending any of it. */
export async function trackQuota(key: string): Promise<TrackQuota> {
  const answer = await call(key, "getquota", {});
  const d = obj(answer.data);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const remaining = num(d.quota_remain);
  const total = num(d.quota_total);
  return { ...(remaining !== undefined ? { remaining } : {}), ...(total !== undefined ? { total } : {}) };
}

/** For Settings › Packages; null when no key is saved. */
export async function savedQuota(accountId: string): Promise<TrackQuota | null> {
  const key = await keyFor(accountId);
  if (!key) return null;
  return trackQuota(key);
}

/** A new key is another 17TRACK account, whose numbers aren't registered yet. */
export async function saveTrackKey(accountId: string, key: string | null): Promise<void> {
  await setSecret(accountId, "packages.17track", key);
  await forget(prefix(accountId));
}
