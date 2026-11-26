import "server-only";

import { createHash, randomUUID } from "node:crypto";

import type { DashboardConfig } from "@/lib/config/schema";
import type { EmergencyAlert, LaundryAppliance, LaundryData } from "@/lib/display/types";
import { LG_LAUNDRY_TYPES, lgRegion, lgState, stState, type LaundryKind, type LaundryReading, type LaundryState } from "@/lib/laundry";
import { smartEntityId } from "@/lib/smartHome";

import { cached, forget } from "./cache";
import { query, run } from "./db";
import { getSecret, setSecret } from "./secrets";
import { dropSmartHomeToken, smartHomeConnected, SmartHomeDisconnected, smartHomeToken } from "./smartHomeAuth";

// Washer and dryer status and "done" (Melvin, 2026-11-25; native cloud APIs, not Home Assistant). Two sources, one
// feed (/api/display/laundry/), read once a minute per household and shared by every display:
//
// - LG ThinQ Connect, LG's official API, with a personal access token the household makes at LG's developer site and
//   pastes in Settings › Laundry (encrypted `lg.token`). Headers and hosts as LG's own SDK (pythinqconnect) sends them.
// - Samsung machines through the SmartThings connection the household already has for the Smart device widget.
//
// Machines rarely say "done" for long: an LG washer shows END for a few minutes then powers off, and a Samsung goes
// back to "stop". So each cycle is remembered in `laundry_state`: a machine that was running and stops reads as done
// until the next cycle starts or `doneMinutes` pass.

const LG_API_KEY = "v6GFvkweNo7DK7yD3ylIZ9w52aKBU0eJ7wLXkSR3"; // LG's public app key, shipped in its SDK (const.py)
const ST_API = "https://api.smartthings.com/v1";
const FEED_TTL = 60_000;
const LIST_TTL = 10 * 60_000;
const MAX_APPLIANCES = 8;

export class LgRefused extends Error {}

// ---- LG ThinQ Connect ----

/** A stable client id per household (LG asks apps not to make a new client on every call). */
function lgClientId(accountId: string): string {
  const h = createHash("sha256").update(`everydaypane-lg:${accountId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** As the SDK: a fresh uuid4 in URL-safe base64 without padding. */
const messageId = () => Buffer.from(randomUUID().replace(/-/g, ""), "hex").toString("base64url");

interface LgAuth {
  token: string;
  country: string;
  clientId: string;
}

async function lgGet(auth: LgAuth, path: string): Promise<unknown> {
  const r = await fetch(`https://api-${lgRegion(auth.country)}.lgthinq.com/${path}`, {
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "x-country": auth.country,
      "x-message-id": messageId(),
      "x-client-id": auth.clientId,
      "x-api-key": LG_API_KEY,
      "x-service-phase": "OP",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (r.status === 401 || r.status === 403) throw new LgRefused(`LG refused (${r.status})`);
  if (r.status === 429) throw new Error("LG rate limit reached");
  if (!r.ok) throw new Error(`LG answered ${r.status}`);
  return ((await r.json()) as { response?: unknown }).response;
}

/** `lg.<slug>`, shaped like the smart-home ids so widgets store the same kind of key. */
const lgId = (raw: string) =>
  `lg.${
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 100) || "device"
  }`;

export interface LgDevice {
  id: string;
  name: string;
  kind: LaundryKind;
  type: string;
}

/** Laundry machines in LG's device list; fridges, ACs and the rest are left out. */
export function trimLgDevices(raw: unknown): LgDevice[] {
  const list = Array.isArray(raw)
    ? (raw as { deviceId?: unknown; deviceInfo?: { deviceType?: unknown; alias?: unknown; modelName?: unknown } }[])
    : [];
  const out: LgDevice[] = [];
  for (const d of list) {
    const type = typeof d.deviceInfo?.deviceType === "string" ? d.deviceInfo.deviceType : "";
    const kind = LG_LAUNDRY_TYPES[type];
    if (!kind || typeof d.deviceId !== "string" || !d.deviceId) continue;
    const alias = typeof d.deviceInfo?.alias === "string" ? d.deviceInfo.alias.trim() : "";
    out.push({ id: d.deviceId, name: (alias || (kind === "dryer" ? "Dryer" : "Washer")).slice(0, 60), kind, type });
  }
  return out;
}

interface LgPart {
  runState?: { currentState?: unknown };
  timer?: { remainHour?: unknown; remainMinute?: unknown; totalHour?: unknown; totalMinute?: unknown };
  location?: { locationName?: unknown };
  error?: unknown;
}

const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))
      ? Number(v)
      : undefined;

function lgReading(id: string, name: string, kind: LaundryKind, part: LgPart): LaundryReading {
  const { state, phase } = lgState(typeof part.runState?.currentState === "string" ? part.runState.currentState : undefined);
  const rh = num(part.timer?.remainHour);
  const rm = num(part.timer?.remainMinute);
  const th = num(part.timer?.totalHour);
  const tm = num(part.timer?.totalMinute);
  const remaining = rh !== undefined || rm !== undefined ? (rh ?? 0) * 60 + (rm ?? 0) : undefined;
  const total = th !== undefined || tm !== undefined ? (th ?? 0) * 60 + (tm ?? 0) : undefined;
  return {
    id,
    name,
    kind,
    source: "lg",
    state,
    ...(phase ? { phase } : {}),
    ...(remaining !== undefined && (state === "running" || state === "paused") ? { remainingMin: remaining } : {}),
    ...(total ? { totalMin: total } : {}),
  };
}

/**
 * One LG state answer to readings. A washer answers a list of parts by location (MAIN, and MINI on a WashCombo with a
 * mini washer); a WashTower may answer `washer` and `dryer` halves. Each part with a run state becomes a machine.
 */
export function trimLgState(device: LgDevice, raw: unknown): LaundryReading[] {
  const id = lgId(device.id);
  if (Array.isArray(raw)) {
    const parts = (raw as LgPart[]).filter((p) => p && typeof p === "object" && p.runState);
    return parts.map((p, i) => {
      const loc = typeof p.location?.locationName === "string" ? p.location.locationName : "";
      const sub = parts.length > 1 && loc && loc !== "MAIN";
      return lgReading(
        sub ? `${id}_${loc.toLowerCase()}` : i ? `${id}_${i}` : id,
        sub ? `${device.name} (${loc.toLowerCase()})` : device.name,
        sub ? "washer" : device.kind,
        p,
      );
    });
  }
  if (!raw || typeof raw !== "object") return [];
  const o = raw as LgPart & { washer?: LgPart; dryer?: LgPart };
  if (o.washer || o.dryer) {
    const out: LaundryReading[] = [];
    if (o.washer) out.push(lgReading(`${id}_washer`, `${device.name} washer`, "washer", o.washer));
    if (o.dryer) out.push(lgReading(`${id}_dryer`, `${device.name} dryer`, "dryer", o.dryer));
    return out;
  }
  return o.runState ? [lgReading(id, device.name, device.kind, o)] : [];
}

async function lgAuth(accountId: string, config: DashboardConfig): Promise<LgAuth | null> {
  const token = await getSecret(accountId, "lg.token");
  return token ? { token, country: config.integrations.smartHome.laundry.country, clientId: lgClientId(accountId) } : null;
}

/** Checks a pasted token before it is saved, so a typo shows in the panel rather than on the wall. */
export async function checkLgToken(accountId: string, token: string, country: string): Promise<LgDevice[]> {
  return trimLgDevices(await lgGet({ token, country, clientId: lgClientId(accountId) }, "devices"));
}

export async function saveLgToken(accountId: string, token: string | null): Promise<void> {
  await setSecret(accountId, "lg.token", token);
  await forget(`laundry:`);
}

async function lgReadings(accountId: string, auth: LgAuth, now: number): Promise<LaundryReading[]> {
  const devices = (
    await cached(`laundry:lg:${accountId}:${auth.country}`, LIST_TTL, async () => trimLgDevices(await lgGet(auth, "devices")), now)
  ).value;
  const out: LaundryReading[] = [];
  for (const d of devices.slice(0, MAX_APPLIANCES)) {
    try {
      out.push(...trimLgState(d, await lgGet(auth, `devices/${encodeURIComponent(d.id)}/state`)));
    } catch (e) {
      if (e instanceof LgRefused) throw e;
      // One machine not answering shows as off without hiding the others.
      out.push({ id: lgId(d.id), name: d.name, kind: d.kind, source: "lg", state: "off" });
    }
  }
  return out;
}

// ---- SmartThings (Samsung washers and dryers) ----

interface StListDevice {
  deviceId?: string;
  label?: string;
  name?: string;
  components?: { id?: string; capabilities?: { id?: string }[]; categories?: { name?: string }[] }[];
}

export interface StLaundryDevice {
  id: string;
  name: string;
  kind: LaundryKind;
}

/** Washers and dryers in a SmartThings device list, by capability (or category, for a machine that lists none yet). */
export function trimStLaundry(raw: unknown): StLaundryDevice[] {
  const items = ((raw as { items?: StListDevice[] } | null)?.items ?? []).filter((d) => typeof d.deviceId === "string" && d.deviceId);
  const out: StLaundryDevice[] = [];
  for (const d of items) {
    const caps = new Set((d.components ?? []).flatMap((c) => c.capabilities ?? []).map((c) => c.id ?? ""));
    const cats = new Set((d.components ?? []).flatMap((c) => c.categories ?? []).map((c) => c.name ?? ""));
    const washer = caps.has("washerOperatingState") || caps.has("samsungce.washerOperatingState") || cats.has("Washer");
    const dryer = caps.has("dryerOperatingState") || caps.has("samsungce.dryerOperatingState") || cats.has("Dryer");
    if (!washer && !dryer) continue;
    const kind: LaundryKind = washer && dryer ? "combo" : washer ? "washer" : "dryer";
    out.push({ id: d.deviceId as string, name: (d.label || d.name || (dryer ? "Dryer" : "Washer")).trim().slice(0, 60), kind });
  }
  return out;
}

type StAttrs = Record<string, { value?: unknown; unit?: unknown } | undefined>;
const val = (c: StAttrs | undefined, a: string) => {
  const v = c?.[a]?.value;
  return typeof v === "string" || typeof v === "number" ? v : undefined;
};

/** One device's `/status` answer (`components.main.<capability>.<attribute>.value`) to a reading. */
export function trimStStatus(device: StLaundryDevice, raw: unknown, now: number): LaundryReading {
  const main = ((raw as { components?: Record<string, Record<string, StAttrs>> } | null)?.components?.main ?? {}) as Record<
    string,
    StAttrs | undefined
  >;
  const dryerFirst = device.kind === "dryer";
  const ce = dryerFirst
    ? main["samsungce.dryerOperatingState"]
    : (main["samsungce.washerOperatingState"] ?? main["samsungce.dryerOperatingState"]);
  const std = dryerFirst ? main.dryerOperatingState : (main.washerOperatingState ?? main.dryerOperatingState);
  const machine = val(std, "machineState") ?? val(ce, "operatingState");
  const job = val(std, "washerJobState") ?? val(std, "dryerJobState") ?? val(ce, "washerJobState") ?? val(ce, "dryerJobState");
  const { state, phase } = stState(
    machine === undefined ? undefined : String(machine),
    job === undefined ? undefined : String(job),
    val(main.switch, "switch") as string | undefined,
  );
  const out: LaundryReading = {
    id: smartEntityId("smartthings", device.id),
    name: device.name,
    kind: device.kind,
    source: "smartthings",
    state,
    ...(phase ? { phase } : {}),
  };
  if (state === "running" || state === "paused") {
    const remaining = num(val(ce, "remainingTime"));
    const completion = val(std, "completionTime");
    const progress = num(val(ce, "progress"));
    if (remaining !== undefined) out.remainingMin = remaining;
    else if (typeof completion === "string") {
      const t = Date.parse(completion);
      if (Number.isFinite(t) && t > now - 60_000) out.endsAt = t;
    }
    // samsungce's progress is a percentage; turn it into a total so the bar uses one rule for both sources.
    if (progress !== undefined && progress > 0 && progress < 100 && out.remainingMin !== undefined)
      out.totalMin = Math.round(out.remainingMin / (1 - progress / 100));
  }
  return out;
}

async function stGet(accountId: string, path: string): Promise<unknown> {
  const token = await smartHomeToken(accountId, "smartthings");
  const r = await fetch(`${ST_API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "User-Agent": "Everydaypane/1.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (r.status === 401) {
    dropSmartHomeToken(accountId, "smartthings");
    throw new SmartHomeDisconnected("smartthings");
  }
  if (!r.ok) throw new Error(`SmartThings answered ${r.status}`);
  return r.json();
}

async function stReadings(accountId: string, now: number): Promise<LaundryReading[]> {
  const devices = (await cached(`laundry:st:${accountId}`, LIST_TTL, async () => trimStLaundry(await stGet(accountId, "/devices")), now))
    .value;
  const out: LaundryReading[] = [];
  for (const d of devices.slice(0, MAX_APPLIANCES)) {
    try {
      out.push(trimStStatus(d, await stGet(accountId, `/devices/${encodeURIComponent(d.id)}/status`), now));
    } catch (e) {
      if (e instanceof SmartHomeDisconnected) throw e;
      out.push({ id: smartEntityId("smartthings", d.id), name: d.name, kind: d.kind, source: "smartthings", state: "off" });
    }
  }
  return out;
}

// ---- Cycles: running → done ----

export interface CycleRow {
  running: boolean;
  endsAt: number | null;
  doneAt: number | null;
}

/** What a machine shows once its done window has passed. */
type Rest = Exclude<LaundryState, "done" | "running" | "paused">;
export type Tracked = LaundryAppliance & { rest: Rest };

/**
 * Moves one machine's remembered cycle on with a new reading. A cycle that was running and now reads idle or off is
 * done, at its expected end if that has passed (the machine may have stopped while no screen was asking), else now.
 */
export function advance(prev: CycleRow | undefined, r: LaundryReading, now: number): { row: CycleRow; appliance: Tracked } {
  const base = { id: r.id, name: r.name, kind: r.kind, ...(r.phase ? { phase: r.phase } : {}) };
  if (r.state === "running" || r.state === "paused") {
    const endsAt = r.endsAt ?? (r.remainingMin !== undefined ? now + r.remainingMin * 60_000 : null);
    const left = endsAt !== null ? Math.max(0, endsAt - now) / 60_000 : undefined;
    const progress = r.totalMin && left !== undefined ? Math.round(Math.min(100, Math.max(0, (1 - left / r.totalMin) * 100))) : undefined;
    return {
      row: { running: true, endsAt, doneAt: null },
      appliance: {
        ...base,
        state: r.state,
        ...(endsAt !== null ? { endsAt } : {}),
        ...(progress !== undefined ? { progress } : {}),
        rest: "idle",
      },
    };
  }
  const stoppedAt = () => (prev?.endsAt && prev.endsAt <= now && now - prev.endsAt < 3 * 3_600_000 ? prev.endsAt : now);
  const rest: Rest = r.state === "off" ? "off" : r.state === "error" ? "error" : "idle";
  let doneAt: number | null = null;
  if (r.state === "done") doneAt = prev?.doneAt ?? (prev?.running ? stoppedAt() : now);
  else if (r.state !== "error") doneAt = prev?.running ? stoppedAt() : (prev?.doneAt ?? null);
  const row = { running: false, endsAt: null, doneAt };
  if (doneAt === null) return { row, appliance: { ...base, state: rest, rest } };
  // Done drops the phase: the cycle is over.
  return { row, appliance: { id: r.id, name: r.name, kind: r.kind, state: "done", doneAt, rest: rest === "error" ? "idle" : rest } };
}

/** Done only for `doneMinutes`; after that a machine nobody restarted shows idle (or off). */
export function settle(a: Tracked, doneMinutes: number, now: number): LaundryAppliance {
  const { rest, ...out } = a;
  if (out.state === "done" && out.doneAt !== undefined && now - out.doneAt > doneMinutes * 60_000) {
    return { id: out.id, name: out.name, kind: out.kind, state: rest };
  }
  return out;
}

async function remember(accountId: string, readings: LaundryReading[], now: number): Promise<Tracked[]> {
  const rows = await query<{ id: string; running: number; ends_at: number | null; done_at: number | null }>(
    "SELECT id, running, ends_at, done_at FROM laundry_state WHERE account_id = ?",
    [accountId],
  );
  const prev = new Map(
    rows.map((r) => [
      r.id,
      {
        running: Number(r.running) === 1,
        endsAt: r.ends_at === null ? null : Number(r.ends_at),
        doneAt: r.done_at === null ? null : Number(r.done_at),
      },
    ]),
  );
  const out: Tracked[] = [];
  for (const r of readings) {
    const { row, appliance } = advance(prev.get(r.id), r, now);
    out.push(appliance);
    await run(
      "INSERT INTO laundry_state (account_id, id, running, ends_at, done_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (account_id, id) DO UPDATE SET running = excluded.running, ends_at = excluded.ends_at, done_at = excluded.done_at, updated_at = excluded.updated_at",
      [accountId, r.id, row.running ? 1 : 0, row.endsAt, row.doneAt, now],
    );
  }
  return out;
}

// ---- The feed ----

export interface LaundrySources {
  lg: boolean;
  smartthings: boolean;
}

export async function laundrySources(accountId: string): Promise<LaundrySources> {
  const [lg, st] = await Promise.all([getSecret(accountId, "lg.token"), smartHomeConnected(accountId, "smartthings")]);
  return { lg: Boolean(lg), smartthings: st };
}

/** Machines for Settings › Laundry and the widget's picker. */
export async function laundryMachines(
  accountId: string,
  config: DashboardConfig,
  now = Date.now(),
): Promise<{ id: string; name: string; kind: LaundryKind }[]> {
  const data = await laundryFeed(accountId, config, now);
  return data.appliances.map((a) => ({ id: a.id, name: a.name, kind: a.kind }));
}

export async function laundryFeed(accountId: string, config: DashboardConfig, now = Date.now()): Promise<LaundryData> {
  const auth = await lgAuth(accountId, config);
  const st = await smartHomeConnected(accountId, "smartthings");
  if (!auth && !st) return { updatedAt: now, configured: false, appliances: [] };
  const errors: string[] = [];
  try {
    const r = await cached(
      `laundry:feed:${accountId}`,
      FEED_TTL,
      async () => {
        const readings: LaundryReading[] = [];
        let reached = false;
        let lastError: unknown = null;
        if (auth)
          await lgReadings(accountId, auth, now).then(
            (x) => void ((reached = true), readings.push(...x)),
            (e: unknown) =>
              void (
                (lastError = e),
                errors.push(
                  e instanceof LgRefused ? "LG refused the token. Paste a new one in Settings › Laundry." : "Couldn't reach LG ThinQ",
                )
              ),
          );
        if (st)
          await stReadings(accountId, now).then(
            (x) => void ((reached = true), readings.push(...x)),
            (e: unknown) =>
              void (
                (lastError = e),
                errors.push(e instanceof SmartHomeDisconnected ? "SmartThings needs connecting again" : "Couldn't reach SmartThings")
              ),
          );
        // Nothing answered: fail, so the last good copy is served instead of every machine vanishing.
        if (!reached) throw lastError ?? new Error("No laundry source answered");
        return remember(accountId, readings.slice(0, MAX_APPLIANCES * 2), now);
      },
      now,
    );
    const doneMinutes = config.integrations.smartHome.laundry.doneMinutes;
    return {
      updatedAt: r.fetchedAt,
      configured: true,
      appliances: r.value.map((a) => settle(a, doneMinutes, now)),
      ...(errors.length ? { error: errors.join(" · ") } : {}),
      ...(r.stale ? { stale: true } : {}),
    };
  } catch {
    return { updatedAt: now, configured: true, appliances: [], error: errors.join(" · ") || "Couldn't reach the laundry" };
  }
}

const hasLaundryWidget = (config: DashboardConfig) => config.views.some((v) => v.widgets.some((w) => w.type === "laundry"));

/** "Washer done" notices for the strip: blue, dismissible, never emailed (`notice`). One per cycle (`sent` = doneAt). */
export function laundryAlerts(data: LaundryData, config: DashboardConfig): EmergencyAlert[] {
  if (!config.integrations.smartHome.laundry.alertDone) return [];
  const at = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.location.timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: config.hour12,
  });
  return data.appliances
    .filter((a): a is LaundryAppliance & { doneAt: number } => a.state === "done" && a.doneAt !== undefined)
    .map((a) => ({
      id: `laundry:${a.id}`,
      source: "laundry" as const,
      severity: "minor" as const,
      notice: true,
      title: `${a.name} is done`,
      area: `finished ${at.format(a.doneAt)}`,
      description: a.kind === "dryer" ? "Time to empty the dryer." : "Time to move the load.",
      sent: a.doneAt,
      expires: null,
    }));
}

/** For the alerts route: only when switched on and a Laundry widget is on some view, so households without one never pay the calls. */
export async function laundryAlertsFor(accountId: string, config: DashboardConfig, now = Date.now()): Promise<EmergencyAlert[]> {
  if (!config.alerts.enabled || !config.integrations.smartHome.laundry.alertDone || !hasLaundryWidget(config)) return [];
  return laundryAlerts(await laundryFeed(accountId, config, now), config);
}
