import "server-only";

import type { UnifiData, UnifiSite } from "@/lib/display/types";

import { cached, forget } from "./cache";
import { getSecret } from "./secrets";

// UniFi network health (Melvin, 2026-11-21: "do all 6", after Claude listed UniFi Site Manager's official cloud API).
// UniFi Site Manager (api.ui.com) is Ubiquiti's own read-only cloud API: an API key made at unifi.ui.com › API, sent
// as `X-API-Key`, stored as the encrypted `unifi.apiKey` secret (docs/unifi.md). No Home Assistant and nothing
// running at home: the gateway already reports to UniFi's cloud. Two reads, shared by every widget and display of a
// household: the sites (device and client counts, gateway online, ISP) every minute, and the five-minute ISP metrics
// for the last 24 hours (latency, packet loss, uptime, throughput) every five minutes. Displays get names and
// numbers only, never IP or MAC addresses. Its answers are parsed leniently: Ubiquiti's examples have shifted between
// the early-access and v1 versions, and one odd site or period never hides the rest.

const BASE = "https://api.ui.com";
const SITES_TTL = 60_000;
const METRICS_TTL = 5 * 60_000;
const DAY = 24 * 60 * 60_000;
const PERIOD = 5 * 60_000;
/** The sparkline is 48 half-hour buckets. */
const BUCKETS = 48;
/** A latest reading older than this doesn't decide "down" (UniFi's cloud can lag). */
const FRESH = 20 * 60_000;

export class UnifiRefused extends Error {}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : Array.isArray(obj(v).data) ? (obj(v).data as unknown[]) : []);
const round = (v: number | undefined, places = 0) => (v === undefined ? undefined : Math.round(v * 10 ** places) / 10 ** places);

async function call(path: string, apiKey: string): Promise<unknown> {
  const r = await fetch(`${BASE}${path}`, {
    headers: { "X-API-Key": apiKey, Accept: "application/json", "User-Agent": "Everydaypane/1.0" },
    signal: AbortSignal.timeout(10_000),
    redirect: "manual",
  });
  if (r.status === 401 || r.status === 403) throw new UnifiRefused("UniFi refused the API key");
  if (r.status === 429) throw new Error("UniFi asked us to slow down");
  if (!r.ok) throw new Error(`UniFi answered ${r.status}`);
  return r.json() as Promise<unknown>;
}

export interface SiteSummary {
  id: string;
  hostId: string;
  name: string;
  isp?: string;
  gatewayOffline: boolean;
  devices?: number;
  offlineDevices?: number;
  clients?: number;
  guests?: number;
  wanUptime?: number;
}

/** Console names by host id, for sites that are all called "Default". */
export function trimHosts(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of list(raw)) {
    const host = obj(item);
    const id = str(host.id);
    const state = obj(host.reportedState);
    const name = str(state.name) || str(state.hostname) || str(obj(host.userData).name);
    if (id && name) out[id] = name;
  }
  return out;
}

export function trimSites(raw: unknown, hostNames: Record<string, string> = {}): SiteSummary[] {
  const out: SiteSummary[] = [];
  for (const item of list(raw)) {
    const site = obj(item);
    const id = str(site.siteId) || str(site.id);
    if (!id) continue;
    const hostId = str(site.hostId);
    const meta = obj(site.meta);
    const stats = obj(site.statistics);
    const counts = obj(stats.counts);
    const desc = str(meta.desc) || str(meta.name);
    const gateway = obj(stats.gateway);
    const name = desc && desc.toLowerCase() !== "default" ? desc : hostNames[hostId] || str(gateway.shortname) || desc || "UniFi";
    const wifi = num(counts.wifiClient);
    const wired = num(counts.wiredClient);
    const firstWan = obj(Object.values(obj(stats.wans))[0]);
    out.push({
      id,
      hostId,
      name,
      isp: str(obj(stats.ispInfo).name) || str(obj(firstWan.ispInfo).name) || undefined,
      gatewayOffline: (num(counts.offlineGatewayDevice) ?? 0) > 0,
      devices: num(counts.totalDevice),
      offlineDevices: num(counts.offlineDevice),
      clients: wifi === undefined && wired === undefined ? undefined : (wifi ?? 0) + (wired ?? 0),
      guests: num(counts.guestClient),
      wanUptime: num(obj(stats.percentages).wanUptime),
    });
  }
  return out;
}

export interface Period {
  at: number;
  latency?: number;
  maxLatency?: number;
  packetLoss?: number;
  download?: number;
  upload?: number;
  uptime?: number;
  /** Minutes of this five-minute period the WAN was down. */
  down: number;
  isp?: string;
}

/** ISP metrics by site id (falling back to host id), each site's periods oldest first. */
export function trimMetrics(raw: unknown): Record<string, Period[]> {
  const out: Record<string, Period[]> = {};
  for (const item of list(raw)) {
    const entry = obj(item);
    const key = str(entry.siteId) || str(entry.hostId);
    if (!key) continue;
    const periods: Period[] = [];
    for (const p of Array.isArray(entry.periods) ? entry.periods : []) {
      const period = obj(p);
      const at = Date.parse(str(period.metricTime));
      if (!Number.isFinite(at)) continue;
      const wan = obj(obj(period.data).wan);
      const uptime = num(wan.uptime);
      const downtime = num(wan.downtime);
      // `downtime` is seconds within the period when UniFi sends it; otherwise uptime's shortfall stands in.
      const down = downtime !== undefined ? downtime / 60 : uptime !== undefined ? ((100 - uptime) / 100) * 5 : 0;
      const dl = num(wan.download_kbps);
      const ul = num(wan.upload_kbps);
      periods.push({
        at,
        latency: num(wan.avgLatency),
        maxLatency: num(wan.maxLatency),
        packetLoss: num(wan.packetLoss),
        download: dl === undefined ? undefined : dl / 1000,
        upload: ul === undefined ? undefined : ul / 1000,
        uptime,
        down: Math.min(5, Math.max(0, down)),
        isp: str(wan.ispName) || undefined,
      });
    }
    periods.sort((a, b) => a.at - b.at);
    out[key] = [...(out[key] ?? []), ...periods];
  }
  return out;
}

/** One site's line for the wall from its summary and its last 24 hours of periods. */
export function siteHealth(site: SiteSummary, periods: Period[], now: number): UnifiSite {
  const since = now - DAY;
  const day = periods.filter((p) => p.at > since && p.at <= now + PERIOD);
  const last = day[day.length - 1];
  const fresh = last !== undefined && now - last.at < FRESH;

  const sums = Array.from({ length: BUCKETS }, () => ({ total: 0, n: 0 }));
  const width = DAY / BUCKETS;
  for (const p of day) {
    if (p.latency === undefined) continue;
    const b = sums[Math.min(BUCKETS - 1, Math.max(0, Math.floor((p.at - since) / width)))];
    if (b) {
      b.total += p.latency;
      b.n += 1;
    }
  }
  const spark = sums.map((b) => (b.n ? Math.round(b.total / b.n) : null));

  const downMinutes = day.reduce((t, p) => t + p.down, 0);
  const lastDown = [...day].reverse().find((p) => p.down > 0);
  const withUptime = day.filter((p) => p.uptime !== undefined);
  const uptime24h = withUptime.length ? withUptime.reduce((t, p) => t + (p.uptime ?? 0), 0) / withUptime.length : site.wanUptime;

  const wanDown = fresh && last.uptime !== undefined && last.uptime < 50;
  return {
    id: site.id,
    name: site.name,
    status: site.gatewayOffline || wanDown ? "down" : "ok",
    isp: last?.isp ?? site.isp,
    latency: fresh ? round(last.latency) : undefined,
    maxLatency: fresh ? round(last.maxLatency) : undefined,
    packetLoss: fresh ? round(last.packetLoss, 1) : undefined,
    download: fresh ? round(last.download, 1) : undefined,
    upload: fresh ? round(last.upload, 1) : undefined,
    spark,
    uptime24h: round(uptime24h, 2),
    downMinutes24h: Math.round(downMinutes),
    lastOutageAt: lastDown ? lastDown.at + PERIOD : undefined,
    readingAt: last?.at,
    devices: site.devices,
    offlineDevices: site.offlineDevices,
    clients: site.clients,
    guests: site.guests,
  };
}

const key = (accountId: string) => `unifi:${accountId}`;

async function sitesFor(accountId: string, apiKey: string, now: number) {
  return cached(
    `${key(accountId)}:sites`,
    SITES_TTL,
    async () => {
      const [sites, hosts] = await Promise.all([call("/v1/sites", apiKey), call("/v1/hosts", apiKey).catch(() => null)]);
      return trimSites(sites, trimHosts(hosts));
    },
    now,
  );
}

/** For Settings: checks a key by listing its sites. Throws UnifiRefused when UniFi says no. */
export async function unifiSitesForKey(apiKey: string): Promise<{ id: string; name: string }[]> {
  const [sites, hosts] = await Promise.all([call("/v1/sites", apiKey), call("/v1/hosts", apiKey).catch(() => null)]);
  return trimSites(sites, trimHosts(hosts)).map((s) => ({ id: s.id, name: s.name }));
}

export async function unifiSites(accountId: string, now = Date.now()): Promise<{ id: string; name: string }[]> {
  const apiKey = await getSecret(accountId, "unifi.apiKey");
  if (!apiKey) return [];
  return (await sitesFor(accountId, apiKey, now)).value.map((s) => ({ id: s.id, name: s.name }));
}

/** Drops cached answers after the key changes. */
export async function forgetUnifi(accountId: string): Promise<void> {
  await forget(key(accountId));
}

export async function unifiFeed(accountId: string, now = Date.now()): Promise<UnifiData> {
  const apiKey = await getSecret(accountId, "unifi.apiKey");
  if (!apiKey) return { updatedAt: now, configured: false, sites: [] };
  let sites: SiteSummary[];
  let stale = false;
  try {
    const got = await sitesFor(accountId, apiKey, now);
    sites = got.value;
    stale = got.stale;
  } catch (e) {
    return { updatedAt: now, configured: true, sites: [], error: e instanceof UnifiRefused ? e.message : "Couldn't reach UniFi" };
  }
  let metrics: Record<string, Period[]> = {};
  try {
    const got = await cached(
      `${key(accountId)}:metrics`,
      METRICS_TTL,
      async () => trimMetrics(await call("/v1/isp-metrics/5m?duration=24h", apiKey)),
      now,
    );
    metrics = got.value;
    stale ||= got.stale;
  } catch {
    // Counts and gateway status still show without the metrics.
  }
  return {
    updatedAt: now,
    configured: true,
    sites: sites.map((s) => siteHealth(s, metrics[s.id] ?? metrics[s.hostId] ?? [], now)),
    stale,
  };
}
