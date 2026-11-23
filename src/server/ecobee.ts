import "server-only";

import type { HaEntity } from "@/lib/display/types";
import { smartEntityId } from "@/lib/smartHome";

import { dropSmartHomeToken, SmartHomeDisconnected, smartHomeToken } from "./smartHomeAuth";

// ecobee API (docs/ecobee.md). Thermostats and room sensors map to HaEntity for the same tile code.

const API = "https://api.ecobee.com/1";

interface EcobeeThermostat {
  identifier?: string;
  name?: string;
  runtime?: { actualTemperature?: number; desiredHeat?: number; desiredCool?: number };
  settings?: { hvacMode?: string; heatTemp?: number; coolTemp?: number };
}

interface EcobeeSelection {
  thermostatList?: EcobeeThermostat[];
}

function toC(fTimes10?: number): number | undefined {
  if (fTimes10 === undefined) return undefined;
  return Math.round((((fTimes10 / 10 - 32) * 5) / 9) * 10) / 10;
}

export function mapEcobeeThermostat(t: EcobeeThermostat, now: number): HaEntity | null {
  const raw = t.identifier;
  if (!raw) return null;
  const id = smartEntityId("ecobee", raw);
  const mode = (t.settings?.hvacMode ?? "off").toLowerCase();
  const current = toC(t.runtime?.actualTemperature);
  const heat = toC(t.runtime?.desiredHeat ?? t.settings?.heatTemp);
  const cool = toC(t.runtime?.desiredCool ?? t.settings?.coolTemp);
  const state = mode === "off" ? "off" : mode;
  return {
    id,
    state,
    name: (t.name ?? "Thermostat").slice(0, 80),
    changed: now,
    current,
    target: heat ?? cool,
    min: 10,
    max: 32,
    step: 0.5,
    unit: "°C",
    action: state,
  };
}

export function parseEcobeeThermostats(raw: unknown, now: number): { id: string; name: string; entity: HaEntity }[] {
  const body = raw as EcobeeSelection;
  const out: { id: string; name: string; entity: HaEntity }[] = [];
  for (const t of body.thermostatList ?? []) {
    const entity = mapEcobeeThermostat(t, now);
    if (!entity) continue;
    out.push({ id: entity.id, name: entity.name, entity });
  }
  return out;
}

async function ecobeeGet(accountId: string, path: string, params: Record<string, string> = {}): Promise<Response> {
  const token = await smartHomeToken(accountId, "ecobee");
  const q = new URLSearchParams({ json: JSON.stringify({ selection: { selectionType: "registered" } }), ...params });
  const r = await fetch(`${API}${path}?${q}`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "Everydaypane/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (r.status === 401) {
    dropSmartHomeToken(accountId, "ecobee");
    throw new SmartHomeDisconnected("ecobee");
  }
  return r;
}

export async function ecobeeDevices(accountId: string, now = Date.now()): Promise<{ id: string; name: string }[]> {
  const r = await ecobeeGet(accountId, "/thermostat");
  if (!r.ok) throw new Error(`ecobee answered ${r.status}`);
  return parseEcobeeThermostats(await r.json(), now).map((d) => ({ id: d.id, name: d.name }));
}

export async function ecobeeEntities(accountId: string, allow: Set<string>, now = Date.now()): Promise<Record<string, HaEntity>> {
  if (!allow.size) return {};
  try {
    const r = await ecobeeGet(accountId, "/thermostat");
    if (!r.ok) return {};
    const entities: Record<string, HaEntity> = {};
    for (const d of parseEcobeeThermostats(await r.json(), now)) {
      if (allow.has(d.id)) entities[d.id] = d.entity;
    }
    return entities;
  } catch (error) {
    if (error instanceof SmartHomeDisconnected) return {};
    throw error;
  }
}

export async function ecobeeAct(accountId: string, entityId: string, action: string, value?: number): Promise<"ok" | "forbidden"> {
  const raw = entityId.replace(/^ecobee\./, "");
  const list = await ecobeeDevices(accountId);
  if (!list.some((d) => d.id === entityId)) return "forbidden";
  const token = await smartHomeToken(accountId, "ecobee");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "Everydaypane/1.0" };

  if (action === "temperature" && value !== undefined && value > 5 && value < 40) {
    const heatF = Math.round((value * 9) / 5 + 32) * 10;
    const body = {
      thermostat: {
        identifier: raw,
        settings: { hvacMode: "heat", heatTemp: heatF, coolTemp: heatF + 40 },
      },
    };
    const r = await fetch(`${API}/thermostat?${new URLSearchParams({ json: JSON.stringify(body) })}`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    return r.ok ? "ok" : "forbidden";
  }
  if (action === "toggle" || action === "on" || action === "off") {
    const mode = action === "off" ? "off" : "heat";
    const body = { thermostat: { identifier: raw, settings: { hvacMode: mode } } };
    const r = await fetch(`${API}/thermostat?${new URLSearchParams({ json: JSON.stringify(body) })}`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    return r.ok ? "ok" : "forbidden";
  }
  return "forbidden";
}
