import "server-only";

import type { DashboardConfig } from "@/lib/config/schema";
import type { HaData, HaEntity } from "@/lib/display/types";

import { getSecret } from "./secrets";

// Home Assistant (Melvin, 2026-11-17): controls, sensors, UniFi Protect cameras and the doorbell, all through Home
// Assistant's REST API, called by our server (displays never talk to Home Assistant). Home Assistant is reached
// through a free Cloudflare Tunnel (Melvin, 2026-11-17: no Nabu Casa), e.g. https://ha.getliftsmith.com, locked with
// Cloudflare Access so only requests carrying our service token get through; the token and the Access service-token
// pair are stored encrypted (homeAssistant.* secrets).
//
// Only entities that appear on some widget (or the doorbell settings) are read, and only those can be controlled, with
// a fixed list of actions per domain. Unlocking is never offered from a wall screen anyone in the kitchen can tap.

export class HaNotConfigured extends Error {
  constructor() {
    super("Home Assistant isn't set up");
  }
}

async function connection(config: DashboardConfig): Promise<{ base: string; headers: Record<string, string> }> {
  const base = config.integrations.homeAssistant.url.replace(/\/+$/, "");
  const token = await getSecret("homeAssistant.token");
  if (!base || !token) throw new HaNotConfigured();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "User-Agent": "Everydaypane/1.0" };
  const accessId = await getSecret("homeAssistant.accessId");
  const accessSecret = await getSecret("homeAssistant.accessSecret");
  if (accessId && accessSecret) {
    headers["CF-Access-Client-Id"] = accessId;
    headers["CF-Access-Client-Secret"] = accessSecret;
  }
  return { base, headers };
}

async function ha(config: DashboardConfig, path: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const c = await connection(config);
  const r = await fetch(`${c.base}${path}`, {
    ...init,
    redirect: "manual",
    headers: { ...c.headers, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  // Cloudflare Access answers a missing or wrong service token with a redirect to its sign-in page.
  if (r.status >= 300 && r.status < 400) throw new Error("Cloudflare Access refused the request: check the service token");
  if (r.status === 401) throw new Error("Home Assistant refused the access token");
  if (!r.ok) throw new Error(`Home Assistant answered ${r.status}`);
  return r;
}

/** Checks the URL, Cloudflare Access and the token, for the admin panel's "Test connection". */
export async function testConnection(config: DashboardConfig): Promise<string> {
  const r = await ha(config, "/api/");
  const body = (await r.json().catch(() => ({}))) as { message?: string };
  return body.message ?? "Connected";
}

// ---- Which entities ----

/** Every entity a widget or the doorbell uses: the only ones read and the only ones that can be controlled. */
export function usedEntities(config: DashboardConfig): { controls: Set<string>; cameras: Set<string>; all: Set<string> } {
  const controls = new Set<string>();
  const cameras = new Set<string>();
  for (const v of config.views)
    for (const w of v.widgets) {
      if (w.type === "haEntity" && w.entityId) controls.add(w.entityId);
      if (w.type === "camera" && w.entityId) cameras.add(w.entityId);
    }
  const d = config.integrations.homeAssistant.doorbell;
  if (d.cameraEntityId) cameras.add(d.cameraEntityId);
  const all = new Set([...controls, ...cameras]);
  if (d.entityId) all.add(d.entityId);
  return { controls, cameras, all };
}

// ---- States ----

interface RawState {
  entity_id?: string;
  state?: string;
  last_changed?: string;
  attributes?: Record<string, unknown>;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 80) : undefined);

export function trimState(s: RawState): HaEntity | null {
  if (!s.entity_id || typeof s.state !== "string") return null;
  const a = s.attributes ?? {};
  return {
    id: s.entity_id,
    state: s.state.slice(0, 60),
    name: str(a.friendly_name) ?? s.entity_id,
    changed: s.last_changed ? Date.parse(s.last_changed) || 0 : 0,
    unit: str(a.unit_of_measurement),
    deviceClass: str(a.device_class),
    brightness: num(a.brightness),
    current: num(a.current_temperature),
    target: num(a.temperature),
    min: num(a.min_temp),
    max: num(a.max_temp),
    step: num(a.target_temp_step),
    action: str(a.hvac_action),
  };
}

// A few seconds of memory cache so many displays polling at once make one call to Home Assistant.
let memo: { key: string; at: number; data: HaData } | null = null;

export async function haFeed(config: DashboardConfig, now = Date.now()): Promise<HaData> {
  const { all } = usedEntities(config);
  const key = [...all].sort().join(",") + config.integrations.homeAssistant.url;
  if (memo && memo.key === key && now - memo.at < 2500) return memo.data;
  if (!all.size) return { updatedAt: now, configured: true, entities: {} };
  let data: HaData;
  try {
    const states = (await (await ha(config, "/api/states")).json()) as RawState[];
    const entities: Record<string, HaEntity> = {};
    for (const s of states) {
      if (!s.entity_id || !all.has(s.entity_id)) continue;
      const t = trimState(s);
      if (t) entities[t.id] = t;
    }
    data = { updatedAt: now, configured: true, entities };
  } catch (error) {
    if (error instanceof HaNotConfigured) data = { updatedAt: now, configured: false, entities: {} };
    else throw error;
  }
  memo = { key, at: now, data };
  return data;
}

/** Entities for the admin panel's pickers: id and name only. */
export async function listEntities(config: DashboardConfig): Promise<{ id: string; name: string }[]> {
  const states = (await (await ha(config, "/api/states", {}, 15_000)).json()) as RawState[];
  return states
    .filter((s) => s.entity_id)
    .map((s) => ({ id: s.entity_id ?? "", name: str(s.attributes?.friendly_name) ?? s.entity_id ?? "" }))
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, 3000);
}

// ---- Actions ----

export type HaAction = "toggle" | "on" | "off" | "brightness" | "open" | "close" | "stop" | "lock" | "press" | "temperature";

/** The Home Assistant service for an action on an entity, or null when that action isn't allowed for its domain. */
export function serviceFor(entityId: string, action: HaAction, value?: number): { path: string; body: Record<string, unknown> } | null {
  const domain = entityId.split(".")[0] ?? "";
  const body: Record<string, unknown> = { entity_id: entityId };
  const call = (service: string, extra: Record<string, unknown> = {}) => ({
    path: `/api/services/${domain}/${service}`,
    body: { ...body, ...extra },
  });
  const switchy = ["light", "switch", "fan", "input_boolean", "media_player", "humidifier", "siren"];
  if (switchy.includes(domain)) {
    if (action === "toggle") return call("toggle");
    if (action === "on") return call("turn_on");
    if (action === "off") return call("turn_off");
    if (action === "brightness" && domain === "light" && value !== undefined)
      return call("turn_on", { brightness_pct: Math.min(100, Math.max(1, Math.round(value))) });
    return null;
  }
  if (domain === "cover") {
    if (action === "open") return call("open_cover");
    if (action === "close") return call("close_cover");
    if (action === "stop") return call("stop_cover");
    if (action === "toggle") return call("toggle");
    return null;
  }
  // Locking only: a wall screen in a shared room is no place to unlock a door from.
  if (domain === "lock") return action === "lock" ? call("lock") : null;
  if (domain === "climate" && action === "temperature" && value !== undefined && value > 0 && value < 100)
    return call("set_temperature", { temperature: Math.round(value * 2) / 2 });
  if ((domain === "scene" || domain === "script") && action === "press") return call("turn_on");
  if ((domain === "button" || domain === "input_button") && action === "press") return call("press");
  return null;
}

export async function act(config: DashboardConfig, entityId: string, action: HaAction, value?: number): Promise<"ok" | "forbidden"> {
  if (!usedEntities(config).controls.has(entityId)) return "forbidden";
  const service = serviceFor(entityId, action, value);
  if (!service) return "forbidden";
  await ha(config, service.path, { method: "POST", body: JSON.stringify(service.body) });
  memo = null;
  return "ok";
}

/** A camera's current picture (UniFi Protect cameras through Home Assistant's camera proxy). */
export async function cameraImage(config: DashboardConfig, entityId: string): Promise<Response | null> {
  if (!usedEntities(config).cameras.has(entityId) || !/^camera\.[a-z0-9_]+$/.test(entityId)) return null;
  const r = await ha(config, `/api/camera_proxy/${entityId}`, {}, 10_000);
  const type = r.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) return null;
  return new Response(r.body, { headers: { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

/** Tests only. */
export function resetHaForTests(): void {
  memo = null;
}
