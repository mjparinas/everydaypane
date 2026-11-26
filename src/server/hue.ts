import "server-only";

import type { HaEntity } from "@/lib/display/types";
import { rgbToXy, xyToHex } from "@/lib/lightColour";
import { smartEntityId } from "@/lib/smartHome";

import { getSecret, setSecret } from "./secrets";
import { dropSmartHomeToken, SmartHomeDisconnected, smartHomeToken } from "./smartHomeAuth";

// Philips Hue lights (Melvin, 2026-11-25: Hue and LIFX beside Govee), through Hue's official Remote API: OAuth with
// Everydaypane's app from developers.meethue.com (HUE_CLIENT_ID / HUE_CLIENT_SECRET in Vercel), then the bridge's CLIP
// v2 API through Hue's cloud (`api.meethue.com/route/clip/v2/…`). Native, not through Home Assistant, and nothing runs
// at home: the bridge already talks to Hue's cloud. Lights show on the Smart device widget (`provider: "hue"`) as
// `hue.*` entities on the shared five-second feed, with on/off, brightness and colour.
//
// The cloud needs two things on every call: the OAuth access token and an application key ("username") that the
// bridge issues. The key is made through the cloud once after connecting (press the link button remotely, then ask
// for a key) and kept encrypted as `hue.appKey`. Hue publishes no hard rate limit for the Remote API but asks apps to
// be gentle, so every light comes from one list read at most every 15 seconds per household, shared by every display;
// a tap updates the kept state at once.

const ROUTE = "https://api.meethue.com/route";
const LIST_EVERY_MS = 15_000;

/** A Hue light as the cloud lists it, trimmed to what the wall can use. */
export interface HueLight {
  /** Our entity id (`hue.<slug>`). */
  id: string;
  /** Hue's own resource id (a UUID), which control calls name. */
  rid: string;
  name: string;
  dimmable: boolean;
  colour: boolean;
  entity: HaEntity;
}

interface RawLight {
  id?: unknown;
  type?: unknown;
  metadata?: { name?: unknown };
  on?: { on?: unknown };
  dimming?: { brightness?: unknown };
  color?: { xy?: { x?: unknown; y?: unknown } };
}

/** Hue's light list (`/resource/light`), trimmed. Odd entries are skipped, never fatal. */
export function parseHueLights(raw: unknown, now: number): HueLight[] {
  const data = (raw as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const out: HueLight[] = [];
  for (const l of data as RawLight[]) {
    if (typeof l.id !== "string" || !l.id || (l.type !== undefined && l.type !== "light")) continue;
    const name = (typeof l.metadata?.name === "string" && l.metadata.name.trim() ? l.metadata.name.trim() : "Hue light").slice(0, 80);
    const on = l.on?.on;
    const id = smartEntityId("hue", l.id);
    const entity: HaEntity = { id, state: on === true ? "on" : on === false ? "off" : "unknown", name, changed: now };
    const bright = l.dimming?.brightness;
    const dimmable = typeof bright === "number";
    // Hue's brightness is a percentage (0 to 100); the tile reads 0 to 255 like Home Assistant.
    if (dimmable) entity.brightness = Math.max(1, Math.round((Math.min(100, Math.max(0, bright)) / 100) * 255));
    const x = l.color?.xy?.x;
    const y = l.color?.xy?.y;
    const colour = typeof x === "number" && typeof y === "number";
    if (colour) entity.color = xyToHex(x, y);
    out.push({ id, rid: l.id.slice(0, 64), name, dimmable, colour, entity });
  }
  return out;
}

export type HueCommand = { action: "on" | "off" | "toggle" } | { action: "brightness"; value: number } | { action: "color"; value: number };

/** The CLIP v2 body for a command, or null when the light can't do it. */
export function hueBody(light: HueLight, cmd: HueCommand): Record<string, unknown> | null {
  if (cmd.action === "on" || cmd.action === "off" || cmd.action === "toggle") {
    const on = cmd.action === "toggle" ? light.entity.state !== "on" : cmd.action === "on";
    return { on: { on } };
  }
  if (cmd.action === "brightness") {
    if (!light.dimmable || !Number.isFinite(cmd.value)) return null;
    return { on: { on: true }, dimming: { brightness: Math.min(100, Math.max(1, Math.round(cmd.value))) } };
  }
  if (cmd.action !== "color" || !light.colour || !Number.isInteger(cmd.value) || cmd.value < 0 || cmd.value > 0xffffff) return null;
  return { on: { on: true }, color: { xy: rgbToXy(cmd.value) } };
}

// ---- Talking to Hue ----

class HueKeyRefused extends Error {}

async function hue(accountId: string, path: string, init: { method?: string; body?: unknown; appKey?: string | null } = {}) {
  const token = await smartHomeToken(accountId, "hue");
  const r = await fetch(`${ROUTE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.appKey ? { "hue-application-key": init.appKey } : {}),
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(10_000),
  });
  if (r.status === 401) {
    // Usually a stale access token: drop it so the next call refreshes, and say "connect again" only if that fails.
    dropSmartHomeToken(accountId, "hue");
    throw new Error("Hue refused the access token");
  }
  if (r.status === 403 && init.appKey) throw new HueKeyRefused("Hue refused the bridge key");
  if (r.status === 429) throw new Error("Hue is limiting requests; try again in a minute");
  if (r.status === 503) throw new Error("The Hue bridge isn't reachable from Hue's cloud");
  if (!r.ok) throw new Error(`Hue answered ${r.status}`);
  return (await r.json().catch(() => null)) as unknown;
}

/** Asks the bridge for an application key through the cloud: a remote press of the link button, then the key. */
async function makeAppKey(accountId: string): Promise<string> {
  await hue(accountId, "/api/0/config", { method: "PUT", body: { linkbutton: true } });
  const raw = await hue(accountId, "/api", { method: "POST", body: { devicetype: "everydaypane#wall" } });
  const first = Array.isArray(raw) ? (raw[0] as { success?: { username?: unknown }; error?: { description?: unknown } }) : null;
  const key = first?.success?.username;
  if (typeof key !== "string" || !key) {
    throw new Error(`Hue didn't issue a bridge key${first?.error?.description ? `: ${String(first.error.description).slice(0, 80)}` : ""}`);
  }
  await setSecret(accountId, "hue.appKey", key);
  return key;
}

async function clip(accountId: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<unknown> {
  const key = (await getSecret(accountId, "hue.appKey")) ?? (await makeAppKey(accountId));
  try {
    return await hue(accountId, `/clip/v2${path}`, { ...init, appKey: key });
  } catch (error) {
    if (!(error instanceof HueKeyRefused)) throw error;
    // The key was removed on the bridge (Hue app › Settings › Apps): make a new one, once.
    return hue(accountId, `/clip/v2${path}`, { ...init, appKey: await makeAppKey(accountId) });
  }
}

const lists = new Map<string, { lights: HueLight[]; at: number }>();

/** Every Hue light on the account, read at most every 15 seconds and shared by every widget and display. */
export async function hueLights(accountId: string, now = Date.now()): Promise<HueLight[]> {
  const held = lists.get(accountId);
  if (held && now - held.at < LIST_EVERY_MS) return held.lights;
  try {
    const lights = parseHueLights(await clip(accountId, "/resource/light"), now);
    lists.set(accountId, { lights, at: now });
    return lights;
  } catch (error) {
    // The last good list stays up while Hue's cloud or the bridge has a bad minute.
    if (held && !(error instanceof SmartHomeDisconnected)) return held.lights;
    throw error;
  }
}

/** For the widget's device picker. */
export async function hueDevices(accountId: string, now = Date.now()): Promise<{ id: string; name: string }[]> {
  return (await hueLights(accountId, now)).map((l) => ({ id: l.id, name: l.name }));
}

/** States of the Hue lights on widgets, for the shared Smart device feed. */
export async function hueEntities(accountId: string, allow: Set<string>, now = Date.now()): Promise<Record<string, HaEntity>> {
  if (!allow.size) return {};
  let lights: HueLight[];
  try {
    lights = await hueLights(accountId, now);
  } catch {
    // Hue being down never hides the other providers' tiles.
    return {};
  }
  const out: Record<string, HaEntity> = {};
  for (const l of lights) if (allow.has(l.id)) out[l.id] = l.entity;
  return out;
}

/** A tap on the wall. The caller has already checked that a widget shows this light. */
export async function hueAct(accountId: string, entityId: string, cmd: HueCommand, now = Date.now()): Promise<"ok" | "forbidden"> {
  const light = (await hueLights(accountId, now)).find((l) => l.id === entityId);
  if (!light) return "forbidden";
  const body = hueBody(light, cmd);
  if (!body) return "forbidden";
  await clip(accountId, `/resource/light/${encodeURIComponent(light.rid)}`, { method: "PUT", body });
  // Shown as if just read, so the next poll has the tap rather than the list from a few seconds ago.
  const e = light.entity;
  e.state = (body.on as { on: boolean }).on ? "on" : "off";
  if (cmd.action === "brightness") e.brightness = Math.max(1, Math.round((Math.min(100, Math.max(1, cmd.value)) / 100) * 255));
  if (cmd.action === "color") e.color = `#${cmd.value.toString(16).padStart(6, "0")}`;
  e.changed = now;
  return "ok";
}

/** Forgets the kept list (after disconnecting). */
export function forgetHue(accountId: string): void {
  lists.delete(accountId);
}

/** Tests only. */
export function resetHueForTests(): void {
  lists.clear();
}
