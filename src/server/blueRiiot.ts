import "server-only";

import { createHash, createHmac } from "node:crypto";

import { POOL_MEASURE_NAMES, poolLevel, poolRange, type PoolKind } from "@/lib/blueRiiot";
import type { DashboardConfig } from "@/lib/config/schema";
import type { EmergencyAlert, PoolData, PoolInfo, PoolReading } from "@/lib/display/types";

import { cached, forget } from "./cache";
import { getSecret, setSecret } from "./secrets";

// Blue Riiot (Blue Connect) pool monitor (Melvin, 2026-11-26). Blue Riiot publishes no developer API, so this reads
// the same cloud its phone app does, as the community integrations (pyblueriiot, Home Assistant's blueconnect custom
// component) do: sign in with the app's email and password, get short-lived AWS credentials, and sign each request
// for Blue Riiot's API Gateway with AWS Signature V4. Melvin agreed to the unofficial route and to storing the app
// password (encrypted, `blueRiiot.email` / `blueRiiot.password`); a change on Blue Riiot's side can break it
// (docs/blue-riiot.md).

const HOST = "api.riiotlabs.com";
const BASE = `https://${HOST}/prod`;
const REGION = "eu-west-1";
const SERVICE = "execute-api";
// A Blue Connect measures about every 20 minutes over Sigfox (hourly or less over Wi-Fi or Bluetooth through the
// app), so a read every 15 minutes, shared by every display, is enough.
const FEED_TTL = 15 * 60_000;
const POOLS_TTL = 6 * 3_600_000;
const MAX_POOLS = 4;
const MAX_DEVICES = 2;

export class BlueRiiotRefused extends Error {}

interface Login {
  email: string;
  password: string;
}

interface Credentials {
  accessKey: string;
  secretKey: string;
  sessionToken: string;
  expires: number;
}

/** Signed-in credentials live only in memory: never in the cache table, which isn't encrypted. */
const sessions = new Map<string, Credentials>();

async function loginFor(accountId: string): Promise<Login | null> {
  const [email, password] = await Promise.all([getSecret(accountId, "blueRiiot.email"), getSecret(accountId, "blueRiiot.password")]);
  return email && password ? { email, password } : null;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const hmac = (key: Buffer | string, s: string) => createHmac("sha256", key).update(s).digest();

/** RFC 3986 encoding, as Signature V4 wants it (encodeURIComponent leaves !'()* alone). */
const rfc3986 = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * AWS Signature V4 headers for a GET to Blue Riiot's API Gateway. Exported for the tests, which check it against
 * AWS's documented example.
 */
export function signV4(
  c: Pick<Credentials, "accessKey" | "secretKey"> & { sessionToken?: string },
  req: { host: string; path: string; query: Record<string, string>; region: string; service: string },
  now: number,
): Record<string, string> {
  const amzDate = new Date(now)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const day = amzDate.slice(0, 8);
  const query = Object.keys(req.query)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(req.query[k] ?? "")}`)
    .join("&");
  const headers: [string, string][] = [
    ["host", req.host],
    ["x-amz-date", amzDate],
  ];
  if (c.sessionToken) headers.push(["x-amz-security-token", c.sessionToken]);
  const signed = headers.map(([k]) => k).join(";");
  const canonical = ["GET", req.path, query, headers.map(([k, v]) => `${k}:${v}\n`).join(""), signed, sha256("")].join("\n");
  const scope = `${day}/${req.region}/${req.service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${c.secretKey}`, day), req.region), req.service), "aws4_request");
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  return {
    "x-amz-date": amzDate,
    ...(c.sessionToken ? { "x-amz-security-token": c.sessionToken } : {}),
    Authorization: `AWS4-HMAC-SHA256 Credential=${c.accessKey}/${scope}, SignedHeaders=${signed}, Signature=${signature}`,
  };
}

async function signIn(login: Login, fresh = false, now = Date.now()): Promise<Credentials> {
  const key = sha256(`${login.email}\n${login.password}`);
  const hit = sessions.get(key);
  if (!fresh && hit && hit.expires - 5 * 60_000 > now) return hit;
  const r = await fetch(`${BASE}/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email: login.email, password: login.password }),
    signal: AbortSignal.timeout(10_000),
  });
  if (r.status === 400 || r.status === 401 || r.status === 403 || r.status === 404)
    throw new BlueRiiotRefused("Blue Riiot didn't accept that email and password");
  if (!r.ok) throw new Error(`Blue Riiot sign-in answered ${r.status}`);
  const body = (await r.json()) as {
    credentials?: { access_key?: string; secret_key?: string; session_token?: string; expiration?: string };
  };
  const cr = body.credentials;
  if (!cr?.access_key || !cr.secret_key || !cr.session_token) throw new Error("Blue Riiot sign-in sent no credentials");
  const expiration = cr.expiration ? Date.parse(cr.expiration) : NaN;
  const creds = {
    accessKey: cr.access_key,
    secretKey: cr.secret_key,
    sessionToken: cr.session_token,
    expires: Number.isFinite(expiration) ? expiration : now + 3_600_000,
  };
  sessions.set(key, creds);
  return creds;
}

async function api<T>(login: Login, path: string, query: Record<string, string> = {}, fresh = false): Promise<T> {
  const creds = await signIn(login, fresh);
  const fullPath = `/prod${path}`;
  const qs = new URLSearchParams(query).toString();
  const r = await fetch(`https://${HOST}${fullPath}${qs ? `?${qs}` : ""}`, {
    headers: {
      Accept: "application/json",
      ...signV4(creds, { host: HOST, path: fullPath, query, region: REGION, service: SERVICE }, Date.now()),
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (r.status === 401 || r.status === 403) {
    // Expired or revoked credentials: sign in afresh next time.
    sessions.clear();
    throw new Error(`Blue Riiot refused (${r.status})`);
  }
  if (r.status === 429) throw new Error("Blue Riiot rate limit reached");
  if (!r.ok) throw new Error(`Blue Riiot answered ${r.status}`);
  return (await r.json()) as T;
}

export interface PoolSummary {
  id: string;
  name: string;
  devices: string[];
}

interface RawPool {
  swimming_pool_id?: string;
  swimming_pool?: { swimming_pool_id?: string; name?: string };
  name?: string;
}

/** The account's pools from `GET /swimming_pool`. */
export function trimPools(raw: unknown): { id: string; name: string }[] {
  const list = (raw as { data?: RawPool[] } | null)?.data ?? [];
  const out: { id: string; name: string }[] = [];
  for (const p of list) {
    const id = p.swimming_pool_id ?? p.swimming_pool?.swimming_pool_id;
    if (typeof id !== "string" || !id) continue;
    out.push({ id, name: p.swimming_pool?.name?.trim() || p.name?.trim() || "Pool" });
  }
  return out.slice(0, MAX_POOLS);
}

/** A pool's Blue Connect serials from `GET /swimming_pool/<id>/blue`. */
export function trimDevices(raw: unknown): string[] {
  const list = (raw as { data?: { blue_device_serial?: string; blue_device?: { serial?: string } }[] } | null)?.data ?? [];
  return list
    .map((d) => d.blue_device_serial ?? d.blue_device?.serial)
    .filter((s): s is string => typeof s === "string" && s !== "")
    .slice(0, MAX_DEVICES);
}

interface RawMeasure {
  name?: string;
  value?: number;
  timestamp?: string;
  trend?: string;
  ok_min?: number | null;
  ok_max?: number | null;
  warning_low?: number | null;
  warning_high?: number | null;
}

const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;
const toF = (c: number) => (c * 9) / 5 + 32;

/**
 * One `lastMeasurements?mode=blue_and_strip` answer as display readings. Levels come from Blue Riiot's own range for
 * each reading (`ok_min`/`ok_max`, `warning_low`/`warning_high`, in metric), filled in from POOL_FALLBACK; temperature
 * then goes to °F for imperial dashboards. Names we don't show (conductivity, strip-only TAC, hardness) are dropped.
 */
export function trimMeasurements(raw: unknown, units: DashboardConfig["units"]): { recorded: number | null; readings: PoolReading[] } {
  const list = (raw as { data?: RawMeasure[] } | null)?.data ?? [];
  const metric = units === "metric";
  const readings: PoolReading[] = [];
  const seen = new Set<PoolKind>();
  let recorded: number | null = null;
  for (const m of list) {
    const kind = m.name ? POOL_MEASURE_NAMES[m.name.toLowerCase()] : undefined;
    if (!kind || seen.has(kind) || typeof m.value !== "number" || !Number.isFinite(m.value)) continue;
    seen.add(kind);
    const range = poolRange(kind, { okMin: m.ok_min, okMax: m.ok_max, warnLow: m.warning_low, warnHigh: m.warning_high });
    const level = poolLevel(m.value, range);
    const t = m.timestamp ? Date.parse(m.timestamp) : NaN;
    if (Number.isFinite(t) && (recorded === null || t > recorded)) recorded = t;
    let value = m.value;
    let unit = "";
    let ideal: [number | null, number | null] = [range.okMin ?? null, range.okMax ?? null];
    switch (kind) {
      case "temp":
        unit = metric ? "°C" : "°F";
        value = round(metric ? value : toF(value), 1);
        if (!metric) ideal = ideal.map((v) => (v === null ? null : Math.round(toF(v)))) as [number | null, number | null];
        break;
      case "ph":
        value = round(value, 1);
        break;
      case "orp":
        unit = "mV";
        value = Math.round(value);
        break;
      case "chlorine":
        unit = "ppm";
        value = round(value, 1);
        break;
      case "salinity":
        unit = "g/L";
        value = round(value, 1);
        break;
    }
    const trend = m.trend === "increase" ? "up" : m.trend === "decrease" ? "down" : undefined;
    readings.push({
      kind,
      value,
      unit,
      level,
      ...(trend ? { trend } : {}),
      ...(level === "none" ? {} : { ideal: { min: ideal[0], max: ideal[1] } }),
    });
  }
  return { recorded, readings };
}

async function poolList(accountId: string, login: Login, now: number): Promise<PoolSummary[]> {
  const r = await cached(
    `blueRiiot:pools:${accountId}`,
    POOLS_TTL,
    async () => {
      const pools = trimPools(await api<unknown>(login, "/swimming_pool"));
      return Promise.all(
        pools.map(async (p) => ({
          ...p,
          devices: trimDevices(await api<unknown>(login, `/swimming_pool/${encodeURIComponent(p.id)}/blue`)),
        })),
      );
    },
    now,
  );
  return r.value;
}

/** For Settings › Pool and the widget's pool picker. */
export async function blueRiiotPools(accountId: string, now = Date.now()): Promise<PoolSummary[] | null> {
  const login = await loginFor(accountId);
  if (!login) return null;
  return poolList(accountId, login, now);
}

/** Signs in with a pasted email and password before they are saved, so a typo shows in the panel, not on the wall. */
export async function checkBlueRiiotLogin(email: string, password: string): Promise<{ id: string; name: string }[]> {
  const login = { email, password };
  // Always a new sign-in: a session kept from before proves nothing about the password typed now.
  return trimPools(await api<unknown>(login, "/swimming_pool", {}, true));
}

export async function saveBlueRiiotLogin(accountId: string, login: Login | null): Promise<void> {
  await setSecret(accountId, "blueRiiot.email", login?.email ?? null);
  await setSecret(accountId, "blueRiiot.password", login?.password ?? null);
  sessions.clear();
  await forget(`blueRiiot:`);
}

export async function blueRiiotFeed(accountId: string, config: DashboardConfig, now = Date.now()): Promise<PoolData> {
  const login = await loginFor(accountId);
  if (!login) return { updatedAt: now, configured: false, pools: [] };
  try {
    const r = await cached(
      `blueRiiot:feed:${accountId}:${config.units}`,
      FEED_TTL,
      async () => {
        const out: PoolInfo[] = [];
        for (const p of await poolList(accountId, login, now)) {
          const readings: PoolReading[] = [];
          let recorded: number | null = null;
          // A pool with two Blue Connects: the first device's reading of each kind wins.
          for (const serial of p.devices) {
            const m = trimMeasurements(
              await api<unknown>(login, `/swimming_pool/${encodeURIComponent(p.id)}/blue/${encodeURIComponent(serial)}/lastMeasurements`, {
                mode: "blue_and_strip",
              }),
              config.units,
            );
            for (const reading of m.readings) if (!readings.some((x) => x.kind === reading.kind)) readings.push(reading);
            if (m.recorded !== null && (recorded === null || m.recorded > recorded)) recorded = m.recorded;
          }
          out.push({ id: p.id, name: p.name, recorded, readings });
        }
        return out;
      },
      now,
    );
    return { updatedAt: r.fetchedAt, configured: true, pools: r.value, ...(r.stale ? { stale: true } : {}) };
  } catch (e) {
    return {
      updatedAt: now,
      configured: true,
      pools: [],
      error: e instanceof BlueRiiotRefused ? "Blue Riiot refused the sign-in. Check it in Settings › Pool." : "Couldn't reach Blue Riiot",
    };
  }
}

const ALERT_KINDS: Partial<Record<PoolKind, string>> = { ph: "pH", orp: "ORP", chlorine: "Free chlorine", salinity: "Salinity" };

/** YYYY-MM-DD in the dashboard's zone, so a dismissed pool alert stays dismissed for the rest of the day. */
const dayIn = (timeZone: string, now: number) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);

/**
 * Pool water far outside Blue Riiot's range (past its warning bounds) for the alert strip, only when switched on in
 * Settings › Pool. Temperature never raises one. "moderate", so the default strip threshold shows them; readings older
 * than six hours never raise one.
 */
export function poolAlerts(data: PoolData, config: DashboardConfig, now: number): EmergencyAlert[] {
  if (!config.integrations.smartHome.blueRiiot.alerts) return [];
  const day = dayIn(config.location.timeZone, now);
  const out: EmergencyAlert[] = [];
  for (const p of data.pools) {
    if (p.recorded === null || now - p.recorded > 6 * 3_600_000) continue;
    for (const r of p.readings) {
      const what = ALERT_KINDS[r.kind];
      if (!what || r.level !== "bad") continue;
      const low = r.ideal?.min != null && r.value < r.ideal.min;
      const unit = r.unit ? ` ${r.unit}` : "";
      const ideal =
        r.ideal?.min != null && r.ideal.max != null ? ` Blue Riiot's ideal range is ${r.ideal.min} to ${r.ideal.max}${unit}.` : "";
      out.push({
        id: `blueRiiot:${r.kind}:${p.id}:${day}`,
        source: "pool",
        severity: "moderate",
        title: `${what} ${low ? "low" : "high"}: ${p.name}`,
        area: p.name,
        description: `${r.value}${unit}.${ideal} The Blue Riiot app says what to add.`,
        sent: p.recorded,
        expires: null,
      });
    }
  }
  return out;
}

export async function poolAlertsFor(accountId: string, config: DashboardConfig, now = Date.now()): Promise<EmergencyAlert[]> {
  if (!config.alerts.enabled || !config.integrations.smartHome.blueRiiot.alerts) return [];
  return poolAlerts(await blueRiiotFeed(accountId, config, now), config, now);
}
