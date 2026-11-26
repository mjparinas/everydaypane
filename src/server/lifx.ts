import "server-only";

import type { HaEntity } from "@/lib/display/types";
import { hsvToHex } from "@/lib/lightColour";
import { smartEntityId } from "@/lib/smartHome";

import { getSecret } from "./secrets";

// LIFX lights (Melvin, 2026-11-25: Hue and LIFX beside Govee), through LIFX's official HTTP API (api.lifx.com/v1) with
// the household's own personal access token from cloud.lifx.com › Settings (secret `lifx.token`, never sent to a
// browser). Native, not through Home Assistant. Lights show on the Smart device widget (`provider: "lifx"`) as `lifx.*`
// entities on the shared five-second feed, with on/off, brightness and colour.
//
// LIFX allows 120 requests a minute per token. One list read (`/lights/all`, every light at once) every 15 seconds per
// household, shared by every display, is 4 a minute, leaving plenty for taps; a tap updates the kept state at once.

const API = "https://api.lifx.com/v1";
const LIST_EVERY_MS = 15_000;

export class LifxTokenMissing extends Error {
  constructor() {
    super("Add a LIFX token under Settings › Smart home");
  }
}

export class LifxTokenRefused extends Error {
  constructor() {
    super("LIFX refused the token");
  }
}

export interface LifxLight {
  /** Our entity id (`lifx.<slug>`). */
  id: string;
  /** LIFX's own light id, which control calls name. */
  lid: string;
  name: string;
  colour: boolean;
  entity: HaEntity;
}

interface RawLight {
  id?: unknown;
  label?: unknown;
  connected?: unknown;
  power?: unknown;
  brightness?: unknown;
  color?: { hue?: unknown; saturation?: unknown };
  product?: { capabilities?: { has_color?: unknown } };
}

/** LIFX's light list, trimmed. Odd entries are skipped, never fatal. */
export function parseLifxLights(raw: unknown, now: number): LifxLight[] {
  if (!Array.isArray(raw)) return [];
  const out: LifxLight[] = [];
  for (const l of raw as RawLight[]) {
    if (typeof l.id !== "string" || !/^[A-Za-z0-9]{1,64}$/.test(l.id)) continue;
    const name = (typeof l.label === "string" && l.label.trim() ? l.label.trim() : "LIFX light").slice(0, 80);
    const id = smartEntityId("lifx", l.id);
    const state = l.connected === false ? "unavailable" : l.power === "on" ? "on" : l.power === "off" ? "off" : "unknown";
    const entity: HaEntity = { id, state, name, changed: now };
    // LIFX's brightness is 0 to 1; the tile reads 0 to 255 like Home Assistant.
    if (typeof l.brightness === "number") entity.brightness = Math.max(1, Math.round(Math.min(1, Math.max(0, l.brightness)) * 255));
    const colour = l.product?.capabilities?.has_color === true;
    if (colour) {
      const hue = typeof l.color?.hue === "number" ? l.color.hue : 0;
      const sat = typeof l.color?.saturation === "number" ? l.color.saturation : 0;
      entity.color = hsvToHex(hue, sat);
    }
    out.push({ id, lid: l.id, name, colour, entity });
  }
  return out;
}

export type LifxCommand =
  { action: "on" | "off" | "toggle" } | { action: "brightness"; value: number } | { action: "color"; value: number };

/** The `/state` body for a command, or null when the light can't do it. */
export function lifxBody(light: LifxLight, cmd: LifxCommand): Record<string, unknown> | null {
  if (cmd.action === "on" || cmd.action === "off" || cmd.action === "toggle") {
    const on = cmd.action === "toggle" ? light.entity.state !== "on" : cmd.action === "on";
    return { power: on ? "on" : "off", duration: 0.3 };
  }
  if (cmd.action === "brightness") {
    if (!Number.isFinite(cmd.value)) return null;
    return { power: "on", brightness: Math.min(100, Math.max(1, Math.round(cmd.value))) / 100, duration: 0.3 };
  }
  if (cmd.action !== "color" || !light.colour || !Number.isInteger(cmd.value) || cmd.value < 0 || cmd.value > 0xffffff) return null;
  return { power: "on", color: `#${cmd.value.toString(16).padStart(6, "0")}`, duration: 0.3 };
}

// ---- Talking to LIFX ----

async function lifx(token: string, path: string, body?: unknown): Promise<unknown> {
  const r = await fetch(`${API}${path}`, {
    method: body === undefined ? "GET" : "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "Everydaypane/1.0",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (r.status === 401 || r.status === 403) throw new LifxTokenRefused();
  if (r.status === 429) throw new Error("LIFX is limiting requests; try again in a minute");
  // `/state` answers 207 with a result per light.
  if (!r.ok) throw new Error(`LIFX answered ${r.status}`);
  return (await r.json().catch(() => null)) as unknown;
}

async function token(accountId: string): Promise<string> {
  const t = await getSecret(accountId, "lifx.token");
  if (!t) throw new LifxTokenMissing();
  return t;
}

/** Checks a token by listing its lights; used before a token is saved. */
export async function lifxCheckToken(t: string): Promise<number> {
  return parseLifxLights(await lifx(t, "/lights/all"), Date.now()).length;
}

const lists = new Map<string, { lights: LifxLight[]; at: number }>();

/** Every LIFX light on the token, read at most every 15 seconds and shared by every widget and display. */
export async function lifxLights(accountId: string, now = Date.now()): Promise<LifxLight[]> {
  const held = lists.get(accountId);
  if (held && now - held.at < LIST_EVERY_MS) return held.lights;
  const t = await token(accountId);
  try {
    const lights = parseLifxLights(await lifx(t, "/lights/all"), now);
    lists.set(accountId, { lights, at: now });
    return lights;
  } catch (error) {
    if (held && !(error instanceof LifxTokenRefused)) return held.lights;
    throw error;
  }
}

export async function lifxDevices(accountId: string, now = Date.now()): Promise<{ id: string; name: string }[]> {
  return (await lifxLights(accountId, now)).map((l) => ({ id: l.id, name: l.name }));
}

/** States of the LIFX lights on widgets, for the shared Smart device feed. */
export async function lifxEntities(accountId: string, allow: Set<string>, now = Date.now()): Promise<Record<string, HaEntity>> {
  if (!allow.size) return {};
  let lights: LifxLight[];
  try {
    lights = await lifxLights(accountId, now);
  } catch {
    // LIFX being down (or no token yet) never hides the other providers' tiles.
    return {};
  }
  const out: Record<string, HaEntity> = {};
  for (const l of lights) if (allow.has(l.id)) out[l.id] = l.entity;
  return out;
}

/** A tap on the wall. The caller has already checked that a widget shows this light. */
export async function lifxAct(accountId: string, entityId: string, cmd: LifxCommand, now = Date.now()): Promise<"ok" | "forbidden"> {
  const light = (await lifxLights(accountId, now)).find((l) => l.id === entityId);
  if (!light) return "forbidden";
  const body = lifxBody(light, cmd);
  if (!body) return "forbidden";
  await lifx(await token(accountId), `/lights/id:${encodeURIComponent(light.lid)}/state`, body);
  const e = light.entity;
  e.state = body.power === "on" ? "on" : "off";
  if (typeof body.brightness === "number") e.brightness = Math.max(1, Math.round(body.brightness * 255));
  if (typeof body.color === "string") e.color = body.color;
  e.changed = now;
  return "ok";
}

/** Forgets the kept list (after the token changes). */
export function forgetLifx(accountId: string): void {
  lists.delete(accountId);
}

/** Tests only. */
export function resetLifxForTests(): void {
  lists.clear();
}
