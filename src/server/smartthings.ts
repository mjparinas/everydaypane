import "server-only";

import type { HaEntity } from "@/lib/display/types";
import { smartEntityId } from "@/lib/smartHome";

import { dropSmartHomeToken, SmartHomeDisconnected, smartHomeToken } from "./smartHomeAuth";

// SmartThings REST API (docs/smartthings.md).

const API = "https://api.smartthings.com/v1";

interface StCapability {
  id?: string;
  status?: { value?: string; unit?: string };
}

interface StComponent {
  id?: string;
  capabilities?: StCapability[];
}

interface StDevice {
  deviceId?: string;
  name?: string;
  components?: StComponent[];
  ocfDeviceType?: string;
}

interface StList {
  items?: StDevice[];
}

const cap = (d: StDevice, id: string) => d.components?.flatMap((c) => c.capabilities ?? []).find((c) => c.id === id)?.status;

export function mapSmartThingsDevice(d: StDevice, now: number): HaEntity | null {
  const raw = d.deviceId;
  if (!raw) return null;
  const id = smartEntityId("smartthings", raw);
  const name = (d.name ?? "Device").slice(0, 80);
  const switchCap = cap(d, "switch") ?? cap(d, "switchLevel");
  const temp = cap(d, "temperatureMeasurement");
  const heatSet = cap(d, "thermostatHeatingSetpoint");
  const coolSet = cap(d, "thermostatCoolingSetpoint");
  const lock = cap(d, "lock");
  const level = cap(d, "switchLevel");

  if (temp || heatSet) {
    const current = temp?.value ? Number(temp.value) : undefined;
    const target = heatSet?.value ? Number(heatSet.value) : coolSet?.value ? Number(coolSet.value) : undefined;
    const modeCap = cap(d, "thermostatMode");
    const state = (modeCap?.value ?? "heat").toLowerCase();
    return {
      id,
      state: state === "off" ? "off" : state,
      name,
      changed: now,
      current: Number.isFinite(current) ? current : undefined,
      target: Number.isFinite(target) ? target : undefined,
      min: 10,
      max: 32,
      step: 0.5,
      unit: temp?.unit ?? "°C",
      action: state,
    };
  }

  if (lock) {
    const locked = lock.value === "locked";
    return { id, state: locked ? "locked" : "unlocked", name, changed: now };
  }

  if (switchCap) {
    const on = switchCap.value === "on";
    const bright = level?.value ? Math.round((Number(level.value) / 100) * 255) : undefined;
    return { id, state: on ? "on" : "off", name, changed: now, brightness: bright };
  }

  const reading = cap(d, "temperatureMeasurement");
  if (reading?.value) {
    return { id, state: reading.value, name, changed: now, unit: reading.unit ?? "" };
  }

  return { id, state: "unknown", name, changed: now };
}

export function parseSmartThingsDevices(raw: unknown, now: number): { id: string; name: string; entity: HaEntity }[] {
  const list = raw as StList;
  const out: { id: string; name: string; entity: HaEntity }[] = [];
  for (const d of list.items ?? []) {
    const entity = mapSmartThingsDevice(d, now);
    if (!entity) continue;
    out.push({ id: entity.id, name: entity.name, entity });
  }
  return out;
}

async function stGet(accountId: string, path: string): Promise<Response> {
  const token = await smartHomeToken(accountId, "smartthings");
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "Everydaypane/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (r.status === 401) {
    dropSmartHomeToken(accountId, "smartthings");
    throw new SmartHomeDisconnected("smartthings");
  }
  return r;
}

export async function smartThingsDevices(accountId: string, now = Date.now()): Promise<{ id: string; name: string }[]> {
  const r = await stGet(accountId, "/devices");
  if (!r.ok) throw new Error(`SmartThings answered ${r.status}`);
  return parseSmartThingsDevices(await r.json(), now).map((d) => ({ id: d.id, name: d.name }));
}

export async function smartThingsEntities(accountId: string, allow: Set<string>, now = Date.now()): Promise<Record<string, HaEntity>> {
  if (!allow.size) return {};
  try {
    const entities: Record<string, HaEntity> = {};
    const r = await stGet(accountId, "/devices");
    if (!r.ok) return {};
    for (const d of parseSmartThingsDevices(await r.json(), now)) {
      if (!allow.has(d.id)) continue;
      const statusR = await stGet(accountId, `/devices/${d.id.replace(/^smartthings\./, "")}/status`);
      if (statusR.ok) {
        const detail = (await statusR.json()) as StDevice;
        detail.deviceId = d.id.replace(/^smartthings\./, "");
        detail.name = d.name;
        const entity = mapSmartThingsDevice(detail, now);
        if (entity) entities[d.id] = entity;
      } else entities[d.id] = d.entity;
    }
    return entities;
  } catch (error) {
    if (error instanceof SmartHomeDisconnected) return {};
    throw error;
  }
}

export async function smartThingsAct(accountId: string, entityId: string, action: string, value?: number): Promise<"ok" | "forbidden"> {
  const raw = entityId.replace(/^smartthings\./, "");
  const list = await smartThingsDevices(accountId);
  if (!list.some((d) => d.id === entityId)) return "forbidden";
  const token = await smartHomeToken(accountId, "smartthings");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "Everydaypane/1.0" };

  if (action === "lock") {
    const r = await fetch(`${API}/devices/${raw}/commands`, {
      method: "POST",
      headers,
      body: JSON.stringify({ commands: [{ component: "main", capability: "lock", command: "lock" }] }),
      signal: AbortSignal.timeout(10_000),
    });
    return r.ok ? "ok" : "forbidden";
  }

  if (action === "toggle" || action === "on" || action === "off") {
    const cmd = action === "off" ? "off" : "on";
    const r = await fetch(`${API}/devices/${raw}/commands`, {
      method: "POST",
      headers,
      body: JSON.stringify({ commands: [{ component: "main", capability: "switch", command: cmd }] }),
      signal: AbortSignal.timeout(10_000),
    });
    return r.ok ? "ok" : "forbidden";
  }

  if (action === "temperature" && value !== undefined && value > 5 && value < 40) {
    const r = await fetch(`${API}/devices/${raw}/commands`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        commands: [
          {
            component: "main",
            capability: "thermostatHeatingSetpoint",
            command: "setHeatingSetpoint",
            arguments: [Math.round(value * 2) / 2],
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return r.ok ? "ok" : "forbidden";
  }

  if (action === "brightness" && value !== undefined) {
    const r = await fetch(`${API}/devices/${raw}/commands`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        commands: [
          { component: "main", capability: "switch", command: "on" },
          { component: "main", capability: "switchLevel", command: "setLevel", arguments: [Math.min(100, Math.max(1, Math.round(value)))] },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return r.ok ? "ok" : "forbidden";
  }

  return "forbidden";
}
