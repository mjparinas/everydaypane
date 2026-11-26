import "server-only";

import type { DashboardConfig } from "@/lib/config/schema";
import type { RachioController, RachioData, RachioWatering } from "@/lib/display/types";

import { cached, forget } from "./cache";
import { getSecret, setSecret } from "./secrets";

// Rachio sprinklers through Rachio's official public API (Melvin, 2026-11-25; native cloud API, not Home Assistant).
// Each household copies its API key from the Rachio app (Profile › API key, or app.rach.io › Account settings ›
// Get API key) into Settings › Sprinklers; it is an encrypted secret and only ever goes in the Authorization header.

const API = "https://api.rach.io/1/public";
// Rachio allows 1,700 calls a day per key, reset at midnight UTC. One read of the account plus one of each
// controller's upcoming schedule every 10 minutes is about 150 a day per controller, shared by every display.
const DATA_TTL = 10 * 60_000;
const PERSON_TTL = 24 * 3_600_000;
const MAX_CONTROLLERS = 8;
/** Rachio's longest rain delay is seven days. */
const MAX_DELAY_S = 7 * 24 * 3600;

export class RachioRefused extends Error {}

async function api<T>(key: string, path: string, init: { method?: "GET" | "PUT"; body?: unknown } = {}): Promise<T> {
  const r = await fetch(`${API}/${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json" },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (r.status === 401 || r.status === 403) throw new RachioRefused(`Rachio refused (${r.status})`);
  if (r.status === 429) throw new Error("Rachio's daily limit is used up");
  if (!r.ok) throw new RachioAnswered(r.status);
  const text = await r.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** Any other answer that isn't ok, kept apart so a refused skip can fall back to a rain delay. */
export class RachioAnswered extends Error {
  constructor(readonly status: number) {
    super(`Rachio answered ${status}`);
  }
}

interface RawZone {
  id?: string;
  zoneNumber?: number;
  name?: string;
}
interface RawRule {
  id?: string;
  name?: string;
  externalName?: string;
  enabled?: boolean;
}
interface RawDevice {
  id?: string;
  name?: string;
  status?: string;
  on?: boolean;
  deleted?: boolean;
  zones?: RawZone[];
  scheduleRules?: RawRule[];
  flexScheduleRules?: RawRule[];
  rainDelayExpirationDate?: number | string;
}

/** A Rachio time: epoch ms, epoch seconds, or an ISO string. */
export function rachioTime(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v < 1e12 ? v * 1000 : v;
  if (typeof v === "string" && v) {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/** What the server keeps about a watering: the display's fields plus which schedule rule it is. */
export interface Upcoming extends RachioWatering {
  ruleId: string;
  flex: boolean;
}

export interface Controller extends Omit<RachioController, "next"> {
  upcoming: Upcoming[];
}

export interface ControllerInfo {
  id: string;
  name: string;
}

/** The controllers on the account, for Settings › Sprinklers and the widget's picker. */
export function trimControllers(person: unknown): (ControllerInfo & { raw: RawDevice })[] {
  const devices = (person as { devices?: RawDevice[] } | null)?.devices ?? [];
  return devices
    .filter((d): d is RawDevice & { id: string } => typeof d.id === "string" && d.id !== "" && !d.deleted)
    .slice(0, MAX_CONTROLLERS)
    .map((d) => ({ id: d.id, name: d.name?.trim() || "Sprinklers", raw: d }));
}

/**
 * One controller's upcoming waterings from `device/<id>/scheduleitem` (the next two weeks). Rachio doesn't document
 * the item fields, so they are read leniently: the start from `absoluteStartDate`, `startDate` or `startTime`, the
 * schedule from `scheduleRuleId` (or `scheduleId`), the length from `totalDuration` or the zones' durations (seconds).
 */
export function trimSchedule(raw: unknown, device: RawDevice): Upcoming[] {
  const items = Array.isArray(raw) ? raw : ((raw as { scheduleItems?: unknown[] } | null)?.scheduleItems ?? []);
  const zoneNames = new Map<string, string>();
  const zoneByNumber = new Map<number, string>();
  for (const z of device.zones ?? []) {
    const name = z.name?.trim() || (typeof z.zoneNumber === "number" ? `Zone ${z.zoneNumber}` : "");
    if (z.id) zoneNames.set(z.id, name);
    if (typeof z.zoneNumber === "number") zoneByNumber.set(z.zoneNumber, name);
  }
  const rules = new Map<string, { name: string; flex: boolean }>();
  for (const r of device.scheduleRules ?? [])
    if (r.id) rules.set(r.id, { name: r.name?.trim() || r.externalName?.trim() || "", flex: false });
  for (const r of device.flexScheduleRules ?? [])
    if (r.id) rules.set(r.id, { name: r.name?.trim() || r.externalName?.trim() || "", flex: true });

  const out: Upcoming[] = [];
  for (const it of items as Record<string, unknown>[]) {
    if (!it || typeof it !== "object") continue;
    const start = rachioTime(it.absoluteStartDate) ?? rachioTime(it.startDate) ?? rachioTime(it.startTime);
    if (start === null) continue;
    const ruleId = typeof it.scheduleRuleId === "string" ? it.scheduleRuleId : typeof it.scheduleId === "string" ? it.scheduleId : "";
    const zones = Array.isArray(it.zones) ? (it.zones as Record<string, unknown>[]) : [];
    const zoneSeconds = zones.reduce((n, z) => n + (typeof z?.duration === "number" ? z.duration : 0), 0);
    const seconds = typeof it.totalDuration === "number" && it.totalDuration > 0 ? it.totalDuration : zoneSeconds;
    const names = zones
      .map((z) =>
        typeof z?.zoneId === "string"
          ? zoneNames.get(z.zoneId)
          : typeof z?.zoneNumber === "number"
            ? zoneByNumber.get(z.zoneNumber)
            : undefined,
      )
      .filter((n): n is string => !!n);
    const rule = rules.get(ruleId);
    const itemName = typeof it.scheduleName === "string" ? it.scheduleName.trim() : "";
    out.push({
      start,
      name: rule?.name || itemName || "Watering",
      minutes: Math.max(1, Math.round(seconds / 60)),
      zones: [...new Set(names)],
      ruleId,
      flex: rule?.flex ?? false,
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

function controllerOf(info: ControllerInfo & { raw: RawDevice }, upcoming: Upcoming[] | null, now: number): Controller {
  const until = rachioTime(info.raw.rainDelayExpirationDate);
  return {
    id: info.id,
    name: info.name,
    online: info.raw.status === undefined ? true : info.raw.status.toUpperCase() === "ONLINE",
    rainDelayUntil: until !== null && until > now ? until : null,
    upcoming: upcoming ?? [],
    ...(upcoming === null ? { noSchedule: true } : {}),
  };
}

const keyFor = (accountId: string) => getSecret(accountId, "rachio.apiKey");
const dataKey = (accountId: string) => `rachio:data:${accountId}:`;
const skipsKey = (accountId: string) => `rachio:skips:${accountId}:`;

async function personId(accountId: string, key: string, now: number): Promise<string> {
  const r = await cached(
    `rachio:person:${accountId}:`,
    PERSON_TTL,
    async () => {
      const body = await api<{ id?: string }>(key, "person/info");
      if (!body?.id) throw new Error("Rachio sent no account id");
      return body.id;
    },
    now,
  );
  return r.value;
}

async function readAll(accountId: string, key: string, now: number): Promise<Controller[]> {
  const person = await api<unknown>(key, `person/${encodeURIComponent(await personId(accountId, key, now))}`);
  const infos = trimControllers(person);
  return Promise.all(
    infos.map(async (info) => {
      // One controller's schedule failing only drops its next watering, never the others.
      const upcoming = await api<unknown>(key, `device/${encodeURIComponent(info.id)}/scheduleitem`)
        .then((raw) => trimSchedule(raw, info.raw))
        .catch(() => null);
      return controllerOf(info, upcoming, now);
    }),
  );
}

async function controllers(accountId: string, key: string, now: number) {
  return cached(dataKey(accountId), DATA_TTL, () => readAll(accountId, key, now), now);
}

async function skipped(accountId: string, now: number): Promise<string[]> {
  return (await cached(skipsKey(accountId), 365 * 24 * 3_600_000, async () => [] as string[], now)).value;
}

const skipMark = (controllerId: string, start: number) => `${controllerId}|${start}`;

/** The next watering that hasn't finished, isn't covered by a rain delay and wasn't skipped from the wall. */
export function nextWatering(c: Controller, skips: readonly string[], now: number): Upcoming | null {
  return (
    c.upcoming.find(
      (u) =>
        u.start + u.minutes * 60_000 > now &&
        !(c.rainDelayUntil !== null && u.start < c.rainDelayUntil) &&
        !skips.includes(skipMark(c.id, u.start)),
    ) ?? null
  );
}

export async function rachioFeed(accountId: string, now = Date.now()): Promise<RachioData> {
  const key = await keyFor(accountId);
  if (!key) return { updatedAt: now, configured: false, controllers: [] };
  try {
    const [r, skips] = await Promise.all([controllers(accountId, key, now), skipped(accountId, now)]);
    return {
      updatedAt: r.fetchedAt,
      configured: true,
      controllers: r.value.map((c): RachioController => {
        const n = nextWatering(c, skips, now);
        return {
          id: c.id,
          name: c.name,
          online: c.online,
          rainDelayUntil: c.rainDelayUntil,
          next: n ? { start: n.start, name: n.name, minutes: n.minutes, zones: n.zones } : null,
          ...(c.noSchedule ? { noSchedule: true } : {}),
        };
      }),
      ...(r.stale ? { stale: true } : {}),
    };
  } catch (e) {
    return {
      updatedAt: now,
      configured: true,
      controllers: [],
      error: e instanceof RachioRefused ? "Rachio refused the API key. Check it in Settings › Sprinklers." : "Couldn't reach Rachio",
    };
  }
}

/** Checks a pasted key before it is saved, so a typo is caught in the panel rather than on the wall. */
export async function checkRachioKey(key: string): Promise<ControllerInfo[]> {
  const info = await api<{ id?: string }>(key, "person/info");
  if (!info?.id) throw new RachioRefused("Rachio sent no account for that key");
  return trimControllers(await api<unknown>(key, `person/${encodeURIComponent(info.id)}`)).map(({ id, name }) => ({ id, name }));
}

/** For Settings › Sprinklers and the widget's picker; null when no key is saved. */
export async function rachioControllers(accountId: string, now = Date.now()): Promise<ControllerInfo[] | null> {
  const key = await keyFor(accountId);
  if (!key) return null;
  return (await controllers(accountId, key, now)).value.map(({ id, name }) => ({ id, name }));
}

export async function saveRachioKey(accountId: string, key: string | null): Promise<void> {
  await setSecret(accountId, "rachio.apiKey", key);
  await forget(`rachio:person:${accountId}:`);
  await forget(dataKey(accountId));
  await forget(skipsKey(accountId));
}

/** Whether a wall tap may skip this controller's next watering: a Sprinklers widget with Skip on shows it. */
export function maySkip(config: DashboardConfig, controllerId: string): boolean {
  return config.views.some((v) =>
    v.widgets.some((w) => w.type === "rachio" && w.allowSkip && (w.devices.length === 0 || w.devices.includes(controllerId))),
  );
}

export type SkipResult = "skipped" | "rain-delay" | "not-allowed" | "gone" | "too-far";

/**
 * Skips one controller's next watering, named by its start so a wall showing an old feed can't skip a different one.
 * A fixed schedule is skipped with `schedulerule/skip`, which skips that schedule's next run. Rachio refuses that for
 * some schedules and controllers ("not supported for 3.0 API", and Flex schedules), so then a rain delay is set that
 * ends a minute after this watering would have finished: nothing else runs in between, because this is the next one.
 */
export async function skipNext(
  accountId: string,
  config: DashboardConfig,
  controllerId: string,
  start: number,
  now = Date.now(),
): Promise<SkipResult> {
  if (!maySkip(config, controllerId)) return "not-allowed";
  const key = await keyFor(accountId);
  if (!key) return "not-allowed";
  const [r, skips] = await Promise.all([controllers(accountId, key, now), skipped(accountId, now)]);
  const c = r.value.find((x) => x.id === controllerId);
  const next = c ? nextWatering(c, skips, now) : null;
  if (!c || !next || next.start !== start || next.start <= now) return "gone";

  let how: SkipResult = "skipped";
  let ruleSkipped = false;
  if (next.ruleId && !next.flex) {
    try {
      await api<unknown>(key, "schedulerule/skip", { method: "PUT", body: { id: next.ruleId } });
      ruleSkipped = true;
    } catch (e) {
      if (!(e instanceof RachioAnswered) || e.status >= 500) throw e;
    }
  }
  if (!ruleSkipped) {
    const seconds = Math.ceil((next.start + next.minutes * 60_000 - now) / 1000) + 60;
    if (seconds > MAX_DELAY_S) return "too-far";
    await api<unknown>(key, "device/rain_delay", { method: "PUT", body: { id: controllerId, duration: seconds } });
    how = "rain-delay";
  }

  // Remember the skip, so the wall moves on to the watering after it even if Rachio still lists this one.
  const keep = skips.filter((m) => Number(m.split("|")[1]) > now - 24 * 3_600_000);
  keep.push(skipMark(controllerId, start));
  await forget(skipsKey(accountId));
  await cached(skipsKey(accountId), 365 * 24 * 3_600_000, async () => keep, now);
  await forget(dataKey(accountId));
  return how;
}
