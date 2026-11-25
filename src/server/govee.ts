import "server-only";

import { randomUUID } from "node:crypto";

import type { HaEntity } from "@/lib/display/types";
import { smartEntityId } from "@/lib/smartHome";

import { cached, forget } from "./cache";
import { getSecret } from "./secrets";

// Govee lights (Melvin, 2026-11-21: "do all 6", Govee among them), through Govee's official developer API
// (developer.govee.com, base https://openapi.api.govee.com/router/api/v1) with the household's own API key from the
// Govee Home app (secret `govee.apiKey`, never sent to a browser). Not through Home Assistant: Melvin wants native cloud
// APIs for new integrations "for now". Lights show on the Smart device widget (`provider: "govee"`) as `govee.*`
// entities on the shared five-second feed, with on/off, brightness, colour and scenes.
//
// Rate limits (Govee's tables, read 2026-11-21): the device list 30 a minute per account, state and scenes 30 a minute
// per device, control 2 a second per device. A widely quoted 10,000 requests a day per key isn't in Govee's own pages,
// but we stay under it anyway: the device list is kept 10 minutes, scenes a day, and each light's state is read at
// most every `stateEveryMs` (one minute, longer when many lights are on the wall, so a day of polling stays under
// about 6,000 reads). A tap updates the kept state at once, so the wall doesn't wait for the next read.

const API = "https://openapi.api.govee.com/router/api/v1";
const DAILY_STATE_BUDGET = 6000;

export class GoveeKeyMissing extends Error {
  constructor() {
    super("Add a Govee API key under Settings › Smart home");
  }
}

export class GoveeKeyRefused extends Error {
  constructor() {
    super("Govee refused the API key");
  }
}

interface Range {
  min: number;
  max: number;
}

/** A Govee device as we keep it: what it can do, never its key. */
export interface GoveeDevice {
  id: string;
  sku: string;
  device: string;
  name: string;
  power: boolean;
  brightness?: Range;
  color: boolean;
  colorTemp?: Range;
  scenes: boolean;
  /** Scenes listed with the device itself (plain numbers), by name. */
  staticScenes: Record<string, unknown>;
}

interface RawCapability {
  type?: string;
  instance?: string;
  parameters?: { dataType?: string; range?: { min?: number; max?: number }; options?: { name?: unknown; value?: unknown }[] };
  state?: { value?: unknown };
}

interface RawDevice {
  sku?: unknown;
  device?: unknown;
  deviceName?: unknown;
  type?: unknown;
  capabilities?: RawCapability[];
}

const range = (c: RawCapability | undefined): Range | undefined => {
  const r = c?.parameters?.range;
  return typeof r?.min === "number" && typeof r.max === "number" && r.max > r.min ? { min: r.min, max: r.max } : undefined;
};

function options(c: RawCapability | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const o of c?.parameters?.options ?? []) {
    if (typeof o.name !== "string" || !o.name.trim() || o.value === undefined || o.value === null) continue;
    const name = o.name.trim().slice(0, 60);
    if (!(name in out)) out[name] = o.value;
  }
  return out;
}

const find = (caps: RawCapability[], instance: string) => caps.find((c) => c.instance === instance);

/** Govee's device list, trimmed to what the wall can use. Odd entries are skipped, never fatal. */
export function parseGoveeDevices(raw: unknown): GoveeDevice[] {
  const data = (raw as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const out: GoveeDevice[] = [];
  for (const d of data as RawDevice[]) {
    if (typeof d.sku !== "string" || typeof d.device !== "string" || !d.sku || !d.device) continue;
    const caps = Array.isArray(d.capabilities) ? d.capabilities : [];
    const scene = find(caps, "lightScene");
    out.push({
      id: smartEntityId("govee", `${d.sku}_${d.device}`),
      sku: d.sku.slice(0, 20),
      device: d.device.slice(0, 64),
      name: (typeof d.deviceName === "string" && d.deviceName.trim() ? d.deviceName.trim() : d.sku).slice(0, 80),
      power: Boolean(find(caps, "powerSwitch")),
      brightness: range(find(caps, "brightness")),
      color: Boolean(find(caps, "colorRgb")),
      colorTemp: range(find(caps, "colorTemperatureK")),
      scenes: Boolean(scene),
      staticScenes: options(scene),
    });
  }
  return out;
}

const hex = (n: number) => `#${(Math.max(0, Math.min(0xffffff, Math.round(n))) >>> 0).toString(16).padStart(6, "0")}`;

/** One light's state, as the Smart device tile reads it. */
export function goveeEntity(d: GoveeDevice, raw: unknown, now: number, sceneNames: string[] = []): HaEntity {
  const caps = ((raw as { payload?: { capabilities?: unknown } } | null)?.payload?.capabilities ?? []) as RawCapability[];
  const value = (instance: string) => (Array.isArray(caps) ? find(caps, instance)?.state?.value : undefined);
  const online = value("online");
  const power = value("powerSwitch");
  const bright = value("brightness");
  const rgb = value("colorRgb");
  const entity: HaEntity = {
    id: d.id,
    // Govee says the other values are old news while a light is offline.
    state: online === false ? "unavailable" : power === 1 ? "on" : power === 0 ? "off" : "unknown",
    name: d.name,
    changed: now,
  };
  if (d.brightness && typeof bright === "number") {
    // Govee's brightness runs 1 to 100 on its lights, a percentage in all but name.
    const pct = bright / d.brightness.max;
    entity.brightness = Math.max(1, Math.round(Math.min(1, Math.max(0, pct)) * 255));
  } else if (d.brightness) entity.brightness = 255;
  if (d.color) entity.color = typeof rgb === "number" ? hex(rgb) : "#ffffff";
  if (sceneNames.length) entity.scenes = sceneNames.slice(0, 60);
  return entity;
}

// ---- Talking to Govee ----

async function apiKey(accountId: string): Promise<string> {
  const key = await getSecret(accountId, "govee.apiKey");
  if (!key) throw new GoveeKeyMissing();
  return key;
}

async function govee(key: string, path: string, body?: unknown): Promise<unknown> {
  const r = await fetch(`${API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Govee-API-Key": key,
      "User-Agent": "Everydaypane/1.0",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (r.status === 401 || r.status === 403) throw new GoveeKeyRefused();
  if (r.status === 429) throw new Error("Govee is limiting requests; try again in a minute");
  if (!r.ok) throw new Error(`Govee answered ${r.status}`);
  const json = (await r.json().catch(() => null)) as { code?: unknown; msg?: unknown; message?: unknown } | null;
  // Govee also reports some failures in a 200 answer's own code.
  if (json && typeof json.code === "number" && json.code !== 200) {
    if (json.code === 401) throw new GoveeKeyRefused();
    throw new Error(`Govee said ${String(json.msg ?? json.message ?? json.code).slice(0, 80)}`);
  }
  return json;
}

const devicesKey = (accountId: string) => `govee:devices:${accountId}`;

/** Checks a key by listing its devices; used before a key is saved. */
export async function goveeCheckKey(key: string): Promise<number> {
  return parseGoveeDevices(await govee(key, "/user/devices")).length;
}

export async function goveeDevices(accountId: string, now = Date.now()): Promise<GoveeDevice[]> {
  const key = await apiKey(accountId);
  return (await cached(devicesKey(accountId), 10 * 60_000, async () => parseGoveeDevices(await govee(key, "/user/devices")), now)).value;
}

/** Forgets the kept device list and states (after the key changes). */
export async function forgetGovee(accountId: string): Promise<void> {
  await forget(devicesKey(accountId));
  await forget(`govee:scenes:${accountId}:`);
  for (const k of states.keys()) if (k.startsWith(`${accountId}:`)) states.delete(k);
}

/** A light's scenes by name: the ones listed with the device, then Govee's dynamic scenes (kept a day). */
async function sceneMap(accountId: string, d: GoveeDevice, now: number): Promise<Record<string, unknown>> {
  if (!d.scenes) return {};
  const key = await apiKey(accountId);
  try {
    const dynamic = await cached(
      `govee:scenes:${accountId}:${d.id}`,
      24 * 60 * 60_000,
      async () => {
        const raw = (await govee(key, "/device/scenes", { requestId: randomUUID(), payload: { sku: d.sku, device: d.device } })) as {
          payload?: { capabilities?: RawCapability[] };
        } | null;
        return options(raw?.payload?.capabilities?.find((c) => c.instance === "lightScene"));
      },
      now,
    );
    return { ...d.staticScenes, ...dynamic.value };
  } catch {
    return d.staticScenes;
  }
}

/** How long a light's state is kept: a minute, or longer when many lights share the daily budget. */
export function stateEveryMs(lights: number): number {
  return Math.max(60_000, Math.ceil((lights * 86_400_000) / DAILY_STATE_BUDGET));
}

const states = new Map<string, { entity: HaEntity; at: number }>();

/** States of the Govee lights on widgets, for the shared Smart device feed. */
export async function goveeEntities(accountId: string, allow: Set<string>, now = Date.now()): Promise<Record<string, HaEntity>> {
  if (!allow.size) return {};
  let key: string;
  let devices: GoveeDevice[];
  try {
    key = await apiKey(accountId);
    devices = (await goveeDevices(accountId, now)).filter((d) => allow.has(d.id));
  } catch (error) {
    if (error instanceof GoveeKeyMissing || error instanceof GoveeKeyRefused) return {};
    throw error;
  }
  const every = stateEveryMs(devices.length);
  const out: Record<string, HaEntity> = {};
  for (const d of devices) {
    const k = `${accountId}:${d.id}`;
    const held = states.get(k);
    if (held && now - held.at < every) {
      out[d.id] = held.entity;
      continue;
    }
    try {
      const raw = await govee(key, "/device/state", { requestId: randomUUID(), payload: { sku: d.sku, device: d.device } });
      const scenes = Object.keys(await sceneMap(accountId, d, now));
      const entity = goveeEntity(d, raw, now, scenes);
      states.set(k, { entity, at: now });
      out[d.id] = entity;
    } catch (error) {
      if (error instanceof GoveeKeyRefused) return {};
      // One light failing never hides the others; the last good state stays up meanwhile.
      if (held) out[d.id] = held.entity;
    }
  }
  return out;
}

export type GoveeCommand =
  | { action: "on" | "off" | "toggle" }
  | { action: "brightness"; value: number }
  | { action: "color"; value: number }
  | { action: "scene"; option: string };

/** The capability Govee's control call takes for a command, or null when the light can't do it. */
export function goveeCapability(
  d: GoveeDevice,
  cmd: GoveeCommand,
  current: HaEntity | undefined,
  scenes: Record<string, unknown> = {},
): { type: string; instance: string; value: unknown } | null {
  if (cmd.action === "on" || cmd.action === "off" || cmd.action === "toggle") {
    if (!d.power) return null;
    const on = cmd.action === "toggle" ? current?.state !== "on" : cmd.action === "on";
    return { type: "devices.capabilities.on_off", instance: "powerSwitch", value: on ? 1 : 0 };
  }
  if (cmd.action === "brightness") {
    if (!d.brightness || !Number.isFinite(cmd.value)) return null;
    const pct = Math.min(100, Math.max(1, Math.round(cmd.value)));
    const value = Math.min(d.brightness.max, Math.max(d.brightness.min, Math.round((d.brightness.max * pct) / 100)));
    return { type: "devices.capabilities.range", instance: "brightness", value };
  }
  if (cmd.action === "color") {
    if (!d.color || !Number.isInteger(cmd.value) || cmd.value < 0 || cmd.value > 0xffffff) return null;
    return { type: "devices.capabilities.color_setting", instance: "colorRgb", value: cmd.value };
  }
  if (cmd.action !== "scene" || !d.scenes || !Object.hasOwn(scenes, cmd.option)) return null;
  return { type: "devices.capabilities.dynamic_scene", instance: "lightScene", value: scenes[cmd.option] };
}

/** A tap on the wall. The caller has already checked that a widget shows this light. */
export async function goveeAct(accountId: string, entityId: string, cmd: GoveeCommand, now = Date.now()): Promise<"ok" | "forbidden"> {
  const d = (await goveeDevices(accountId, now)).find((x) => x.id === entityId);
  if (!d) return "forbidden";
  const k = `${accountId}:${d.id}`;
  const held = states.get(k);
  const scenes = cmd.action === "scene" ? await sceneMap(accountId, d, now) : {};
  const capability = goveeCapability(d, cmd, held?.entity, scenes);
  if (!capability) return "forbidden";
  await govee(await apiKey(accountId), "/device/control", {
    requestId: randomUUID(),
    payload: { sku: d.sku, device: d.device, capability },
  });
  if (held) {
    const e: HaEntity = { ...held.entity };
    if (capability.instance === "powerSwitch") e.state = capability.value === 1 ? "on" : "off";
    else e.state = "on";
    if (cmd.action === "brightness") e.brightness = Math.max(1, Math.round((Math.min(100, Math.max(1, cmd.value)) / 100) * 255));
    if (cmd.action === "color") e.color = hex(cmd.value);
    // Kept as if just read, so the next poll shows the tap rather than Govee's slightly older state.
    states.set(k, { entity: e, at: now });
  }
  return "ok";
}

/** Tests only. */
export function resetGoveeForTests(): void {
  states.clear();
}
