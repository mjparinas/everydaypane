import "server-only";

import { createHmac, randomInt } from "node:crypto";

import type { DashboardConfig } from "@/lib/config/schema";
import type { EcoFlowData, EcoFlowDevice } from "@/lib/display/types";

import { cached, forget } from "./cache";
import { getSecret } from "./secrets";

// EcoFlow power stations through EcoFlow's own IoT Developer Platform (Melvin, 2026-11-21: native, not Home
// Assistant). Each household pastes its access key and secret key from developer.ecoflow.com; both are encrypted
// secrets. Every call is signed: HMAC-SHA256 (hex) with the secret key over the request's parameters sorted by name,
// then accessKey, nonce and timestamp. Setup: docs/ecoflow.md.

/** EcoFlow serves accounts from regional hosts; a key only works on its own region's host, so each is tried in turn. */
export const ECOFLOW_HOSTS = ["https://api-a.ecoflow.com", "https://api-e.ecoflow.com", "https://api.ecoflow.com"] as const;
export const MAX_ECOFLOW_DEVICES = 8;

const LIST_TTL = 10 * 60_000;
const QUOTA_TTL = 60_000;

export interface EcoFlowKeys {
  accessKey: string;
  secretKey: string;
}

/** EcoFlow refused the keys (or none of its hosts knows them): shown in Settings, never retried in a tight loop. */
export class EcoFlowError extends Error {}

function flatten(params: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) v.forEach((item, i) => out.push(`${key}[${i}]=${String(item)}`));
    else if (typeof v === "object") out.push(...flatten(v as Record<string, unknown>, key));
    else out.push(`${key}=${String(v as string | number | boolean)}`);
  }
  return out;
}

/** The string EcoFlow signs: sorted parameters, then the three header values in a fixed order. */
export function signString(params: Record<string, unknown>, accessKey: string, nonce: string, timestamp: string): string {
  const sorted = flatten(params).sort();
  return [...sorted, `accessKey=${accessKey}`, `nonce=${nonce}`, `timestamp=${timestamp}`].join("&");
}

export function signedHeaders(
  keys: EcoFlowKeys,
  params: Record<string, unknown>,
  now = Date.now(),
  nonce = String(randomInt(100000, 1000000)),
) {
  const timestamp = String(now);
  const sign = createHmac("sha256", keys.secretKey)
    .update(signString(params, keys.accessKey, nonce, timestamp))
    .digest("hex");
  return { accessKey: keys.accessKey, nonce, timestamp, sign };
}

interface Envelope {
  code?: string | number;
  message?: string;
  data?: unknown;
}

async function call(host: string, path: string, keys: EcoFlowKeys, params: Record<string, string> = {}): Promise<unknown> {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`${host}${path}${qs ? `?${qs}` : ""}`, {
    headers: { ...signedHeaders(keys, params), "Content-Type": "application/json;charset=UTF-8", "User-Agent": "Everydaypane/1.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new EcoFlowError(`EcoFlow answered ${r.status}`);
  const body = (await r.json()) as Envelope;
  if (String(body.code) !== "0")
    throw new EcoFlowError(body.message ? `EcoFlow: ${body.message}` : `EcoFlow refused (${String(body.code)})`);
  return body.data;
}

export interface EcoFlowListed {
  sn: string;
  name: string;
  product: string;
  online: boolean;
}

export function trimDeviceList(raw: unknown): EcoFlowListed[] {
  if (!Array.isArray(raw)) return [];
  const out: EcoFlowListed[] = [];
  for (const row of raw as Record<string, unknown>[]) {
    const sn = typeof row.sn === "string" ? row.sn : "";
    if (!sn) continue;
    const product = typeof row.productName === "string" ? row.productName : "";
    const name = typeof row.deviceName === "string" && row.deviceName.trim() ? row.deviceName.trim() : product || sn;
    out.push({ sn, name: name.slice(0, 60), product: product.slice(0, 60), online: Number(row.online) === 1 });
  }
  return out;
}

async function keysFor(accountId: string): Promise<EcoFlowKeys | null> {
  const [accessKey, secretKey] = await Promise.all([getSecret(accountId, "ecoflow.accessKey"), getSecret(accountId, "ecoflow.secretKey")]);
  return accessKey && secretKey ? { accessKey, secretKey } : null;
}

/** The household's devices and the host that answered for its keys. Cached ten minutes. */
async function listed(accountId: string, keys: EcoFlowKeys, now: number) {
  return cached(
    `ecoflow:list:${accountId}:`,
    LIST_TTL,
    async () => {
      let last: unknown = null;
      for (const host of ECOFLOW_HOSTS) {
        try {
          return { host, devices: trimDeviceList(await call(host, "/iot-open/sign/device/list", keys)) };
        } catch (e) {
          last = e;
        }
      }
      throw last instanceof Error ? last : new EcoFlowError("EcoFlow didn't answer");
    },
    now,
  );
}

/** After new keys are saved: read the device list again with them. */
export async function forgetEcoFlow(accountId: string): Promise<void> {
  await forget(`ecoflow:list:${accountId}:`);
  await forget(`ecoflow:quota:${accountId}:`);
}

/** For Settings › EcoFlow: the devices the keys can see, read fresh. */
export async function ecoflowDevices(accountId: string, now = Date.now()): Promise<EcoFlowListed[]> {
  const keys = await keysFor(accountId);
  if (!keys) return [];
  const list = await listed(accountId, keys, now);
  if (list.stale) throw new EcoFlowError("EcoFlow didn't answer just now");
  return list.value.devices;
}

// Quota names differ by product line, so each reading is the first name a device reports. Names that end in "/10"
// are in tenths of a watt. Delta 2, River 2, Delta Max and Delta Pro use pd.* / inv.* / mppt.*; Delta 3, River 3 and
// Delta Pro 3 use the pow* and cms* names; PowerStream uses 20_1.*; a Smart Plug reports only its own draw (2_1.watts).
const SOC = ["pd.soc", "cmsBattSoc", "bmsBattSoc", "bms_bmsStatus.soc", "20_1.batSoc"];
const IN = ["pd.wattsInSum", "powInSumW"];
const OUT = ["pd.wattsOutSum", "powOutSumW", "2_1.watts/10", "20_1.invOutputWatts/10"];
const SOLAR = ["mppt.inWatts/10", "powGetPv", "pd.chgSunPower"];
const SOLAR_PARTS = [
  ["powGetPvH", "powGetPvL"],
  ["20_1.pv1InputWatts/10", "20_1.pv2InputWatts/10"],
];
const AC_IN = ["inv.inputWatts", "powGetAcIn"];
const AC_OUT = ["inv.outputWatts", "powGetAcOut"];
const CHG_MIN = ["bms_emsStatus.chgRemainTime", "ems.chgRemainTime", "cmsChgRemTime"];
const DSG_MIN = ["bms_emsStatus.dsgRemainTime", "ems.dsgRemainTime", "cmsDsgRemTime"];
/** EcoFlow reports 5999 minutes (and more) when it can't estimate. */
const MAX_MINUTES = 5940;

function num(q: Record<string, unknown>, name: string): number | undefined {
  const [key, div] = name.split("/");
  const v = q[key!];
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return div ? n / Number(div) : n;
}

function first(q: Record<string, unknown>, names: string[]): number | undefined {
  for (const name of names) {
    const n = num(q, name);
    if (n !== undefined) return n;
  }
  return undefined;
}

function watts(n: number | undefined): number | undefined {
  return n === undefined ? undefined : Math.max(0, Math.round(n));
}

function minutes(n: number | undefined): number | undefined {
  if (n === undefined) return undefined;
  const m = Math.round(Math.abs(n));
  return m > 0 && m < MAX_MINUTES ? m : undefined;
}

export function trimQuotas(raw: unknown, listedDevice: EcoFlowListed): EcoFlowDevice {
  const q = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const soc = first(q, SOC);
  const inW = watts(first(q, IN));
  const outW = watts(first(q, OUT));
  let solar = first(q, SOLAR);
  if (solar === undefined) {
    for (const parts of SOLAR_PARTS) {
      const got = parts.map((p) => num(q, p)).filter((n): n is number => n !== undefined);
      if (got.length) {
        solar = got.reduce((a, b) => a + b, 0);
        break;
      }
    }
  }
  const acOutW = watts(first(q, AC_OUT));
  const dcOutW = outW !== undefined && acOutW !== undefined ? Math.max(0, outW - acOutW) : undefined;
  const full = soc !== undefined && soc >= 100;
  const charging = !full && inW !== undefined && inW > (outW ?? 0) + 5;
  const toFull = minutes(first(q, CHG_MIN));
  const toEmpty = minutes(first(q, DSG_MIN)) ?? minutes(num(q, "pd.remainTime"));
  return {
    sn: listedDevice.sn,
    name: listedDevice.name,
    online: listedDevice.online,
    soc: soc !== undefined ? Math.max(0, Math.min(100, Math.round(soc))) : undefined,
    inW,
    outW,
    solarW: watts(solar),
    acInW: watts(first(q, AC_IN)),
    acOutW,
    dcOutW,
    charging,
    minutes: charging ? toFull : (outW ?? 0) > 0 ? toEmpty : undefined,
  };
}

/** Serial numbers on this household's EcoFlow widgets; null when a widget shows every device. */
export function ecoflowSerials(config: DashboardConfig): Set<string> | null {
  const out = new Set<string>();
  for (const view of config.views) {
    for (const w of view.widgets) {
      if (w.type !== "ecoflow") continue;
      if (w.devices.length === 0) return null;
      w.devices.forEach((sn) => out.add(sn));
    }
  }
  return out;
}

export async function ecoflowFeed(accountId: string, config: DashboardConfig, now = Date.now()): Promise<EcoFlowData> {
  const keys = await keysFor(accountId);
  if (!keys) return { updatedAt: now, configured: false, devices: [] };
  let list;
  try {
    list = await listed(accountId, keys, now);
  } catch (e) {
    return { updatedAt: now, configured: true, devices: [], error: e instanceof EcoFlowError ? e.message : "EcoFlow didn't answer" };
  }
  const wanted = ecoflowSerials(config);
  const { host } = list.value;
  const picked = list.value.devices.filter((d) => !wanted || wanted.has(d.sn)).slice(0, MAX_ECOFLOW_DEVICES);
  // One device failing (asleep, unplugged from Wi-Fi) never hides the others.
  const devices = await Promise.all(
    picked.map(async (d) => {
      try {
        const q = await cached(
          `ecoflow:quota:${accountId}:${d.sn}`,
          QUOTA_TTL,
          async () => trimQuotas(await call(host, "/iot-open/sign/device/quota/all", keys, { sn: d.sn }), d),
          now,
        );
        return { ...q.value, name: d.name, online: d.online, stale: q.stale || undefined };
      } catch {
        return { sn: d.sn, name: d.name, online: false, charging: false } satisfies EcoFlowDevice;
      }
    }),
  );
  return { updatedAt: now, configured: true, devices, stale: list.stale || undefined };
}
