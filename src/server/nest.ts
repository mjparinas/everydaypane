import "server-only";

import type { HaEntity } from "@/lib/display/types";
import { smartEntityId } from "@/lib/smartHome";

import { env } from "./env";
import { dropSmartHomeToken, SmartHomeDisconnected, smartHomeToken } from "./smartHomeAuth";

// Google Nest Device Access (SDM API). Needs a paid Device Access project (NEST_PROJECT_ID) and OAuth (docs/nest.md).

const SDM = "https://smartdevicemanagement.googleapis.com/v1";

interface NestDevice {
  name?: string;
  type?: string;
  traits?: Record<string, Record<string, unknown>>;
  parentRelations?: { parent?: string; displayName?: string }[];
}

interface NestList {
  devices?: NestDevice[];
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 80) : undefined);

function rawId(name: string): string {
  return name.split("/").pop() ?? name;
}

function displayName(d: NestDevice): string {
  const parent = d.parentRelations?.find((r) => r.displayName)?.displayName;
  if (parent) return parent;
  const type = d.type?.replace("sdm.devices.types.", "").replace(/_/g, " ") ?? "Device";
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
}

/** Maps an SDM device to a HaEntity-shaped row for the wall. */
export function mapNestDevice(d: NestDevice, now: number): HaEntity | null {
  const name = d.name;
  if (!name) return null;
  const id = smartEntityId("nest", rawId(name));
  const traits = d.traits ?? {};
  const t = traits["sdm.devices.traits.Temperature"];
  const therm = traits["sdm.devices.traits.ThermostatTemperatureSetpoint"];
  const mode = traits["sdm.devices.traits.ThermostatMode"];
  const onOff = traits["sdm.devices.traits.OnOff"];
  const bright = traits["sdm.devices.traits.Brightness"];
  const sensor = traits["sdm.devices.traits.Humidity"] ?? traits["sdm.devices.traits.Temperature"];

  if (d.type?.includes("THERMOSTAT") || therm || mode) {
    const m = str(mode?.mode)?.toLowerCase() ?? "off";
    const heat = num(therm?.heatCelsius);
    const cool = num(therm?.coolCelsius);
    const ambient = num(t?.ambientTemperatureCelsius) ?? num(sensor?.ambientTemperatureCelsius);
    const state = m === "off" ? "off" : m === "heat" ? "heat" : m === "cool" ? "cool" : m;
    return {
      id,
      state,
      name: displayName(d),
      changed: now,
      current: ambient,
      target: heat ?? cool,
      min: 10,
      max: 32,
      step: 0.5,
      unit: "°C",
      action: state,
    };
  }

  if (onOff) {
    const on = onOff.status === true;
    return {
      id,
      state: on ? "on" : "off",
      name: displayName(d),
      changed: now,
      brightness: num(bright?.brightnessPercent) !== undefined ? Math.round((num(bright?.brightnessPercent) ?? 0) * 2.55) : undefined,
    };
  }

  if (sensor) {
    const ambient = num(t?.ambientTemperatureCelsius) ?? num(sensor?.ambientHumidityPercent);
    const humidity = num(traits["sdm.devices.traits.Humidity"]?.ambientHumidityPercent);
    const reading = ambient ?? humidity;
    if (reading === undefined) return null;
    return {
      id,
      state: String(Math.round(reading * 10) / 10),
      name: displayName(d),
      changed: now,
      unit: humidity !== undefined && ambient === undefined ? "%" : "°C",
    };
  }

  return {
    id,
    state: "unknown",
    name: displayName(d),
    changed: now,
  };
}

export function parseNestDevices(raw: unknown, now: number): { id: string; name: string; entity: HaEntity }[] {
  const list = raw as NestList;
  const out: { id: string; name: string; entity: HaEntity }[] = [];
  for (const d of list.devices ?? []) {
    const entity = mapNestDevice(d, now);
    if (!entity) continue;
    out.push({ id: entity.id, name: entity.name, entity });
  }
  return out;
}

async function sdmGet(accountId: string, path: string): Promise<Response> {
  const project = env.nestProjectId();
  if (!project) throw new Error("NEST_PROJECT_ID isn't set");
  const token = await smartHomeToken(accountId, "nest");
  const r = await fetch(`${SDM}/enterprises/${project}/${path}`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "Everydaypane/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (r.status === 401) {
    dropSmartHomeToken(accountId, "nest");
    throw new SmartHomeDisconnected("nest");
  }
  return r;
}

export async function nestDevices(accountId: string, now = Date.now()): Promise<{ id: string; name: string }[]> {
  const r = await sdmGet(accountId, "devices");
  if (!r.ok) throw new Error(`Nest answered ${r.status}`);
  return parseNestDevices(await r.json(), now).map((d) => ({ id: d.id, name: d.name }));
}

export async function nestEntities(accountId: string, allow: Set<string>, now = Date.now()): Promise<Record<string, HaEntity>> {
  if (!allow.size) return {};
  try {
    const r = await sdmGet(accountId, "devices");
    if (!r.ok) return {};
    const entities: Record<string, HaEntity> = {};
    for (const d of parseNestDevices(await r.json(), now)) {
      if (allow.has(d.id)) entities[d.id] = d.entity;
    }
    return entities;
  } catch (error) {
    if (error instanceof SmartHomeDisconnected) return {};
    throw error;
  }
}

export async function nestAct(accountId: string, entityId: string, action: string, value?: number): Promise<"ok" | "forbidden"> {
  const project = env.nestProjectId();
  if (!project) return "forbidden";
  const raw = entityId.replace(/^nest\./, "");
  const devices = await nestDevices(accountId);
  const match = devices.find((d) => d.id === entityId);
  if (!match) return "forbidden";
  // SDM names are enterprises/project/devices/RAW — look up from a fresh list in production; here use devices list shape.
  const deviceName = `enterprises/${project}/devices/${raw}`;
  const token = await smartHomeToken(accountId, "nest");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "Everydaypane/1.0" };

  if (action === "toggle" || action === "on" || action === "off") {
    const on = action === "on" || action === "toggle";
    const r = await fetch(`${SDM}/${deviceName}:executeCommand`, {
      method: "POST",
      headers,
      body: JSON.stringify({ command: "sdm.devices.commands.OnOff", params: { on } }),
      signal: AbortSignal.timeout(10_000),
    });
    return r.ok ? "ok" : "forbidden";
  }
  if (action === "temperature" && value !== undefined && value > 5 && value < 40) {
    const r = await fetch(`${SDM}/${deviceName}:executeCommand`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        command: "sdm.devices.commands.ThermostatTemperatureSetpoint.SetHeat",
        params: { heatCelsius: Math.round(value * 2) / 2 },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return r.ok ? "ok" : "forbidden";
  }
  if (action === "brightness" && value !== undefined) {
    const r = await fetch(`${SDM}/${deviceName}:executeCommand`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        command: "sdm.devices.commands.Brightness.SetBrightness",
        params: { brightness: Math.min(100, Math.max(1, Math.round(value))) },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return r.ok ? "ok" : "forbidden";
  }
  return "forbidden";
}
