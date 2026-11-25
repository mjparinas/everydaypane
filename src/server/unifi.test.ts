import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as displayGET } from "@/app/api/display/unifi/route";
import { GET as adminGET, PUT as adminPUT } from "@/app/api/household/unifi/route";
import type { UnifiData } from "@/lib/display/types";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { cookieFor, req, useTestServer } from "@/test/server";

import { clearMemoryCache } from "./cache";
import { addDevice } from "./devices";
import { getSecret, setSecret } from "./secrets";
import { siteHealth, trimHosts, trimMetrics, trimSites, unifiFeed } from "./unifi";

// UniFi Site Manager's answers, in the shapes of its API documentation (developer.ui.com); this sandbox can't reach
// api.ui.com, so these stand in for it.
const NOW = Date.parse("2026-11-21T20:00:00Z");
const KEY = "abcdefghijklmnop0123456789";

const sites = {
  data: [
    {
      siteId: "site-home",
      hostId: "host-udm",
      meta: { desc: "Default", gatewayMac: "aa:bb:cc:dd:ee:ff", name: "default", timezone: "America/Vancouver" },
      statistics: {
        counts: {
          criticalNotification: 0,
          gatewayDevice: 1,
          guestClient: 2,
          offlineDevice: 1,
          offlineGatewayDevice: 0,
          totalDevice: 6,
          wifiClient: 18,
          wiredClient: 5,
        },
        gateway: { hardwareId: "x", shortname: "UDMPRO" },
        ispInfo: { name: "Shaw", organization: "Shaw Communications" },
        percentages: { txRetry: 3.2, wanUptime: 99.9 },
        wans: { WAN: { externalIp: "203.0.113.9", ispInfo: { name: "Shaw" }, wanUptime: 99.9 } },
      },
      permission: "admin",
      isOwner: true,
    },
    { meta: { desc: "No id, skipped" } },
  ],
  httpStatusCode: 200,
  traceId: "t",
};
const hosts = { data: [{ id: "host-udm", reportedState: { name: "Parinas Home", hostname: "udm" } }], httpStatusCode: 200 };

const period = (minsAgo: number, wan: Record<string, unknown>) => ({
  metricTime: new Date(NOW - minsAgo * 60_000).toISOString(),
  version: "1",
  data: { wan },
});
const metrics = {
  data: [
    {
      metricType: "5m",
      hostId: "host-udm",
      siteId: "site-home",
      periods: [
        period(5, {
          avgLatency: 12.4,
          maxLatency: 30,
          packetLoss: 0,
          uptime: 100,
          downtime: 0,
          download_kbps: 24_500,
          upload_kbps: 1_200,
          ispName: "Shaw",
        }),
        period(60, { avgLatency: 15, uptime: 60, downtime: 120, ispName: "Shaw" }),
        period(65, { avgLatency: 14, uptime: 100 }),
        period(25 * 60, { avgLatency: 900, uptime: 0, downtime: 300 }),
        { metricTime: "not a time", data: { wan: {} } },
      ],
    },
  ],
};

function stubUnifi(answers: Partial<Record<"sites" | "hosts" | "metrics", Response | (() => Response)>> = {}) {
  const fetch = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const pick = url.pathname.startsWith("/v1/isp-metrics") ? "metrics" : url.pathname.startsWith("/v1/hosts") ? "hosts" : "sites";
    const answer = answers[pick];
    void init;
    if (answer) return Promise.resolve(typeof answer === "function" ? answer() : answer.clone());
    return Promise.resolve(Response.json(pick === "metrics" ? metrics : pick === "hosts" ? hosts : sites));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("UniFi Site Manager trims", () => {
  it("names a Default site after its console and counts clients", () => {
    const [site, ...rest] = trimSites(sites, trimHosts(hosts));
    expect(rest).toEqual([]);
    expect(site).toEqual({
      id: "site-home",
      hostId: "host-udm",
      name: "Parinas Home",
      isp: "Shaw",
      gatewayOffline: false,
      devices: 6,
      offlineDevices: 1,
      clients: 23,
      guests: 2,
      wanUptime: 99.9,
    });
    // Nothing that could identify the home's line reaches the summary.
    expect(JSON.stringify(site)).not.toContain("203.0.113.9");
    expect(JSON.stringify(site)).not.toContain("aa:bb");
  });

  it("reads periods oldest first and turns downtime seconds into minutes", () => {
    const periods = trimMetrics(metrics)["site-home"] ?? [];
    expect(periods.map((p) => p.down)).toEqual([5, 0, 2, 0]);
    expect(periods.at(-1)).toMatchObject({ latency: 12.4, download: 24.5, upload: 1.2, isp: "Shaw" });
  });

  it("sums the last 24 hours, keeps the latest reading and builds a 48-point sparkline", () => {
    const [summary] = trimSites(sites, trimHosts(hosts));
    const site = siteHealth(summary!, trimMetrics(metrics)["site-home"] ?? [], NOW);
    expect(site).toMatchObject({
      status: "ok",
      latency: 12,
      maxLatency: 30,
      packetLoss: 0,
      download: 24.5,
      downMinutes24h: 2,
      lastOutageAt: NOW - 55 * 60_000,
      uptime24h: 86.67,
      clients: 23,
    });
    expect(site.spark).toHaveLength(48);
    expect(site.spark.at(-1)).toBe(12);
    expect(site.spark.filter((v) => v !== null)).toEqual([14, 15, 12]);
  });

  it("is down when the gateway is offline to UniFi's cloud, and hides an old reading", () => {
    const [summary] = trimSites(sites);
    const site = siteHealth({ ...summary!, gatewayOffline: true }, trimMetrics(metrics)["site-home"] ?? [], NOW + 60 * 60_000);
    expect(site.status).toBe("down");
    expect(site.latency).toBeUndefined();
  });

  it("is down when the latest reading has the WAN down", () => {
    const [summary] = trimSites(sites);
    const site = siteHealth(summary!, [{ at: NOW - 60_000, uptime: 0, down: 5 }], NOW);
    expect(site.status).toBe("down");
    expect(site.downMinutes24h).toBe(5);
  });
});

describe("UniFi network feed", () => {
  useTestServer();
  afterEach(() => {
    vi.unstubAllGlobals();
    clearMemoryCache();
  });

  it("says it isn't set up without a key, and asks UniFi nothing", async () => {
    const fetch = stubUnifi();
    expect(await unifiFeed(LEGACY_ACCOUNT_ID, NOW)).toEqual({ updatedAt: NOW, configured: false, sites: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the key as X-API-Key and shares one read between displays", async () => {
    await setSecret(LEGACY_ACCOUNT_ID, "unifi.apiKey", KEY);
    const fetch = stubUnifi();
    const data = await unifiFeed(LEGACY_ACCOUNT_ID, NOW);
    expect(data.configured).toBe(true);
    expect(data.sites[0]).toMatchObject({ id: "site-home", name: "Parinas Home", latency: 12 });
    const asked = fetch.mock.calls.map(([u, init]) => ({ url: String(u), key: new Headers(init?.headers).get("x-api-key") }));
    expect(asked).toEqual([
      { url: "https://api.ui.com/v1/sites", key: KEY },
      { url: "https://api.ui.com/v1/hosts", key: KEY },
      { url: "https://api.ui.com/v1/isp-metrics/5m?duration=24h", key: KEY },
    ]);
    expect(asked.every((a) => !a.url.includes(KEY))).toBe(true);
    await unifiFeed(LEGACY_ACCOUNT_ID, NOW + 30_000);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("still shows the counts when the ISP metrics fail", async () => {
    await setSecret(LEGACY_ACCOUNT_ID, "unifi.apiKey", KEY);
    stubUnifi({ metrics: () => new Response("busy", { status: 429 }) });
    const data = await unifiFeed(LEGACY_ACCOUNT_ID, NOW);
    expect(data.sites[0]).toMatchObject({ clients: 23, downMinutes24h: 0, status: "ok" });
    expect(data.sites[0]?.latency).toBeUndefined();
  });

  it("says when UniFi refuses the key", async () => {
    await setSecret(LEGACY_ACCOUNT_ID, "unifi.apiKey", KEY);
    stubUnifi({ sites: () => new Response("no", { status: 401 }) });
    expect(await unifiFeed(LEGACY_ACCOUNT_ID, NOW)).toMatchObject({ configured: true, sites: [], error: "UniFi refused the API key" });
  });

  it("serves displays and turns away requests without a display", async () => {
    await setSecret(LEGACY_ACCOUNT_ID, "unifi.apiKey", KEY);
    stubUnifi();
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const r = await displayGET(req("/api/display/unifi/", { headers: { "x-display-token": token } }));
    const body = (await r.json()) as UnifiData;
    expect(body.sites[0]?.name).toBe("Parinas Home");
    expect((await displayGET(req("/api/display/unifi/"))).status).toBe(401);
  });
});

describe("Settings › UniFi network", () => {
  useTestServer();
  afterEach(() => {
    vi.unstubAllGlobals();
    clearMemoryCache();
  });

  const put = (cookie: string, apiKey: string | null) =>
    adminPUT(req("/api/household/unifi/", { method: "PUT", headers: { cookie }, body: JSON.stringify({ apiKey }) }));

  it("checks a key with UniFi before saving it, and never sends it back", async () => {
    const admin = await cookieFor("admin@example.com");
    stubUnifi({ sites: () => new Response("no", { status: 401 }) });
    const refused = await put(admin, KEY);
    expect(refused.status).toBe(400);
    expect(await getSecret(LEGACY_ACCOUNT_ID, "unifi.apiKey")).toBeNull();

    stubUnifi();
    const saved = await put(admin, KEY);
    expect(await saved.json()).toEqual({ ok: true, sites: [{ id: "site-home", name: "Parinas Home" }] });
    expect(await getSecret(LEGACY_ACCOUNT_ID, "unifi.apiKey")).toBe(KEY);

    const status = await adminGET(req("/api/household/unifi/", { headers: { cookie: admin } }));
    const text = await status.text();
    expect(JSON.parse(text)).toEqual({ connected: true, sites: [{ id: "site-home", name: "Parinas Home" }], error: "" });
    expect(text).not.toContain(KEY);

    await put(admin, null);
    expect(await getSecret(LEGACY_ACCOUNT_ID, "unifi.apiKey")).toBeNull();
  });

  it("is for household admins only", async () => {
    const kid = await cookieFor("kid@example.com");
    expect((await put(kid, KEY)).status).toBe(401);
    expect((await adminGET(req("/api/household/unifi/", { headers: { cookie: kid } }))).status).toBe(401);
  });
});
