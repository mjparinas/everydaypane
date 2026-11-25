import "server-only";

import { createHash } from "node:crypto";

import { airLevel, AIRTHINGS_SENSOR_TYPES, BQ_PER_PCI, RADON_ALERT_BQ, type AirthingsKind } from "@/lib/airthings";
import type { DashboardConfig } from "@/lib/config/schema";
import type { AirthingsData, AirthingsDevice, AirthingsReading, EmergencyAlert } from "@/lib/display/types";

import { cached, forget } from "./cache";
import { getSecret, setSecret } from "./secrets";

// Airthings indoor air through the official consumer API (Melvin, 2026-11-21; native, not Home Assistant). Each
// household makes its own API client at dashboard.airthings.com (Integrations › API) and pastes the id and secret in
// Settings › Indoor air; both are encrypted secrets. The cloud only knows what a device has uploaded: a Wave reaches it
// through a hub or the phone app's Bluetooth sync (docs/airthings.md).

const TOKEN_URL = "https://accounts-api.airthings.com/v1/token";
const API = "https://consumer-api.airthings.com/v1";
// The consumer API allows about 120 requests an hour per client. Devices upload every 5 minutes at best (hourly for a
// Wave through the app), so one read every 5 minutes, shared by every display, is plenty.
const SENSORS_TTL = 5 * 60_000;
const DEVICES_TTL = 60 * 60_000;
const MAX_PAGES = 4;

export class AirthingsRefused extends Error {}

/** Access tokens live only in memory: never in the cache table, which isn't encrypted. */
const tokens = new Map<string, { token: string; expires: number }>();

interface Client {
  id: string;
  secret: string;
}

async function clientFor(accountId: string): Promise<Client | null> {
  const [id, secret] = await Promise.all([getSecret(accountId, "airthings.clientId"), getSecret(accountId, "airthings.clientSecret")]);
  return id && secret ? { id, secret } : null;
}

async function accessToken(client: Client, now = Date.now()): Promise<string> {
  const key = createHash("sha256").update(`${client.id}\n${client.secret}`).digest("hex");
  const hit = tokens.get(key);
  if (hit && hit.expires - 5 * 60_000 > now) return hit.token;
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    // As Home Assistant's airthings-cloud library signs in: the client in the body and the read-only scope.
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: client.id,
      client_secret: client.secret,
      scope: ["read:device:current_values"],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (r.status === 400 || r.status === 401 || r.status === 403)
    throw new AirthingsRefused("Airthings didn't accept that client id and secret");
  if (!r.ok) throw new Error(`Airthings sign-in answered ${r.status}`);
  const body = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Airthings sign-in sent no token");
  tokens.set(key, { token: body.access_token, expires: now + (body.expires_in ?? 3600) * 1000 });
  return body.access_token;
}

async function api<T>(client: Client, path: string): Promise<T> {
  const token = await accessToken(client);
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (r.status === 401) tokens.clear();
  if (r.status === 401 || r.status === 403) throw new AirthingsRefused(`Airthings refused (${r.status})`);
  if (r.status === 429) throw new Error("Airthings rate limit reached");
  if (!r.ok) throw new Error(`Airthings answered ${r.status}`);
  return (await r.json()) as T;
}

interface RawDevice {
  serialNumber?: string;
  name?: string;
  type?: string;
  home?: string;
}
interface RawSensor {
  sensorType?: string;
  value?: number;
  unit?: string;
}
interface RawResult {
  serialNumber?: string;
  sensors?: RawSensor[];
  recorded?: string;
  batteryPercentage?: number;
}

/** The first Airthings account the client can see (a personal client sees just its own). */
async function accountOf(client: Client): Promise<string> {
  const body = await api<{ accounts?: { id?: string }[] }>(client, "/accounts");
  const id = body.accounts?.[0]?.id;
  if (!id) throw new Error("Airthings has no account for this client");
  return id;
}

export interface AirthingsDeviceInfo {
  serial: string;
  name: string;
  type: string;
}

export function trimDevices(raw: unknown): AirthingsDeviceInfo[] {
  const list = (raw as { devices?: RawDevice[] } | null)?.devices ?? [];
  return list
    .filter((d): d is RawDevice & { serialNumber: string } => typeof d.serialNumber === "string" && d.serialNumber !== "")
    .map((d) => ({ serial: d.serialNumber, name: d.name?.trim() || d.serialNumber, type: d.type ?? "" }));
}

/** Airthings sends `recorded` without a zone ("2025-01-01T12:34:56"); it is UTC. */
export function parseRecorded(s: string | undefined): number | null {
  if (!s) return null;
  const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  return Number.isFinite(t) ? t : null;
}

/**
 * Turns one sensors answer (asked for in metric) into display readings: levels from the metric value, then
 * temperature to °F and radon to pCi/L for imperial dashboards. Sensors we don't show are dropped.
 */
export function trimSensors(raw: unknown, names: Map<string, string>, units: DashboardConfig["units"]): AirthingsDevice[] {
  const results = (raw as { results?: RawResult[] } | null)?.results ?? [];
  const metric = units === "metric";
  const out: AirthingsDevice[] = [];
  for (const r of results) {
    if (typeof r.serialNumber !== "string" || !r.serialNumber) continue;
    const readings: AirthingsReading[] = [];
    const seen = new Set<AirthingsKind>();
    for (const s of r.sensors ?? []) {
      const kind = s.sensorType ? AIRTHINGS_SENSOR_TYPES[s.sensorType] : undefined;
      if (!kind || seen.has(kind) || typeof s.value !== "number" || !Number.isFinite(s.value)) continue;
      seen.add(kind);
      const level = airLevel(kind, s.value);
      let value = s.value;
      let unit: string;
      switch (kind) {
        case "radon":
          unit = metric ? "Bq/m³" : "pCi/L";
          value = metric ? Math.round(value) : Math.round((value / BQ_PER_PCI) * 10) / 10;
          break;
        case "co2":
          unit = "ppm";
          value = Math.round(value);
          break;
        case "voc":
          unit = "ppb";
          value = Math.round(value);
          break;
        case "pm25":
        case "pm1":
          unit = "µg/m³";
          value = Math.round(value);
          break;
        case "humidity":
          unit = "%";
          value = Math.round(value);
          break;
        case "temp":
          unit = metric ? "°C" : "°F";
          value = Math.round((metric ? value : (value * 9) / 5 + 32) * 10) / 10;
          break;
      }
      readings.push({ kind, value, unit, level });
    }
    out.push({
      serial: r.serialNumber,
      name: names.get(r.serialNumber) ?? r.serialNumber,
      recorded: parseRecorded(r.recorded),
      ...(typeof r.batteryPercentage === "number" ? { battery: Math.round(r.batteryPercentage) } : {}),
      readings,
    });
  }
  return out;
}

async function deviceList(accountId: string, client: Client, now: number): Promise<AirthingsDeviceInfo[]> {
  const r = await cached(
    `airthings:devices:${accountId}`,
    DEVICES_TTL,
    async () => trimDevices(await api<unknown>(client, `/accounts/${encodeURIComponent(await accountOf(client))}/devices`)),
    now,
  );
  return r.value;
}

/** For Settings › Indoor air and the widget's device picker. */
export async function airthingsDevices(accountId: string, now = Date.now()): Promise<AirthingsDeviceInfo[] | null> {
  const client = await clientFor(accountId);
  if (!client) return null;
  return deviceList(accountId, client, now);
}

/** Checks a pasted client before it is saved, so a typo is caught in the panel rather than on the wall. */
export async function checkAirthingsClient(id: string, secret: string): Promise<AirthingsDeviceInfo[]> {
  const client = { id, secret };
  return trimDevices(await api<unknown>(client, `/accounts/${encodeURIComponent(await accountOf(client))}/devices`));
}

export async function saveAirthingsClient(accountId: string, client: Client | null): Promise<void> {
  await setSecret(accountId, "airthings.clientId", client?.id ?? null);
  await setSecret(accountId, "airthings.clientSecret", client?.secret ?? null);
  tokens.clear();
  await forget(`airthings:`);
}

export async function airthingsFeed(accountId: string, config: DashboardConfig, now = Date.now()): Promise<AirthingsData> {
  const client = await clientFor(accountId);
  if (!client) return { updatedAt: now, configured: false, devices: [] };
  try {
    const r = await cached(
      `airthings:sensors:${accountId}:${config.units}`,
      SENSORS_TTL,
      async () => {
        const names = new Map((await deviceList(accountId, client, now)).map((d) => [d.serial, d.name]));
        const account = encodeURIComponent(await accountOf(client));
        const devices: AirthingsDevice[] = [];
        for (let page = 1; page <= MAX_PAGES; page++) {
          const body = await api<{ hasNext?: boolean }>(client, `/accounts/${account}/sensors?unit=metric&pageNumber=${page}`);
          devices.push(...trimSensors(body, names, config.units));
          if (!body.hasNext) break;
        }
        return devices;
      },
      now,
    );
    return { updatedAt: r.fetchedAt, configured: true, devices: r.value, ...(r.stale ? { stale: true } : {}) };
  } catch (e) {
    return {
      updatedAt: now,
      configured: true,
      devices: [],
      error:
        e instanceof AirthingsRefused ? "Airthings refused the API client. Check it in Settings › Indoor air." : "Couldn't reach Airthings",
    };
  }
}

/** YYYY-MM-DD in the dashboard's zone, so a dismissed indoor alert stays dismissed for the rest of the day. */
const dayIn = (timeZone: string, now: number) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);

/**
 * High radon and CO₂ for the alert strip, only when switched on in Settings › Indoor air. "moderate", so the default
 * strip threshold shows them; readings older than six hours never raise one.
 */
export function indoorAlerts(data: AirthingsData, config: DashboardConfig, now: number): EmergencyAlert[] {
  const a = config.integrations.smartHome.airthings;
  if (!a.alertRadon && !a.alertCo2) return [];
  const day = dayIn(config.location.timeZone, now);
  const out: EmergencyAlert[] = [];
  for (const d of data.devices) {
    if (d.recorded === null || now - d.recorded > 6 * 3_600_000) continue;
    for (const r of d.readings) {
      const radon = a.alertRadon && r.kind === "radon" && r.level === "poor";
      const co2 = a.alertCo2 && r.kind === "co2" && r.value >= a.co2Ppm;
      if (!radon && !co2) continue;
      const what = radon ? "radon" : "CO₂";
      out.push({
        id: `airthings:${r.kind}:${d.serial}:${day}`,
        source: "indoorAir",
        severity: "moderate",
        title: `High ${what}: ${d.name}`,
        area: d.name,
        description: radon
          ? `${r.value} ${r.unit}. Airthings flags radon from ${RADON_ALERT_BQ} Bq/m³; open windows and check the long-term average in the Airthings app.`
          : `${r.value} ppm. Open a window or run the fan.`,
        sent: d.recorded,
        expires: null,
      });
    }
  }
  return out;
}

export async function indoorAlertsFor(accountId: string, config: DashboardConfig, now = Date.now()): Promise<EmergencyAlert[]> {
  const a = config.integrations.smartHome.airthings;
  if (!config.alerts.enabled || (!a.alertRadon && !a.alertCo2)) return [];
  return indoorAlerts(await airthingsFeed(accountId, config, now), config, now);
}
