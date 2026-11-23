import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as adminGET } from "@/app/api/admin/commute/route";
import { GET as displayGET } from "@/app/api/display/commute/route";
import { defaultConfig } from "@/lib/config/defaults";
import type { DashboardConfig } from "@/lib/config/schema";
import type { CommuteData } from "@/lib/display/types";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { cookieFor, req, useTestServer } from "@/test/server";

import { clearMemoryCache } from "./cache";
import { commuteFeed, trimGeocode, trimRoute } from "./commute";
import { loadConfig, saveConfig } from "./config";
import { addDevice } from "./devices";

// TomTom's answers, trimmed from its Routing and Search API documentation (this sandbox can't reach TomTom).
const route = (travel: number, delay: number, free: number, meters = 38_200) => ({
  formatVersion: "0.0.12",
  routes: [
    {
      summary: {
        lengthInMeters: meters,
        travelTimeInSeconds: travel,
        trafficDelayInSeconds: delay,
        trafficLengthInMeters: 4100,
        departureTime: "2026-11-19T07:40:00-08:00",
        arrivalTime: "2026-11-19T08:21:00-08:00",
        noTrafficTravelTimeInSeconds: free,
        historicTrafficTravelTimeInSeconds: travel - 60,
        liveTrafficIncidentsTravelTimeInSeconds: travel,
      },
    },
  ],
});
const geocode = {
  summary: { query: "4700 kingsway burnaby", numResults: 2 },
  results: [
    {
      type: "Point Address",
      address: { freeformAddress: "4700 Kingsway, Burnaby BC V5H 4M1" },
      position: { lat: 49.2276, lon: -123.0004 },
    },
    {
      type: "Point Address",
      address: { freeformAddress: "4700 Kingsway, Burnaby BC V5H 4M1" },
      position: { lat: 49.2276, lon: -123.0004 },
    },
    { type: "Street", address: { freeformAddress: "Kingsway, Vancouver BC" }, position: { lat: 49.25, lon: -123.07 } },
  ],
};

function withPlaces(config: DashboardConfig): DashboardConfig {
  const c = structuredClone(config);
  c.integrations.commute = {
    home: { label: "20338 65 Ave, Langley", latitude: 49.1146, longitude: -122.6611 },
    destinations: [
      { id: "work", name: "Work", emoji: "🏢", arriveBy: "", label: "4700 Kingsway, Burnaby", latitude: 49.2276, longitude: -123.0004 },
      {
        id: "school",
        name: "School",
        emoji: "🏫",
        arriveBy: "08:30",
        label: "21405 56 Ave, Langley",
        latitude: 49.1027,
        longitude: -122.6328,
      },
    ],
  };
  return c;
}

describe("commute data", () => {
  it("keeps the drive time, the traffic delay and the time on empty roads", () => {
    expect(trimRoute(route(2460, 540, 1920))).toEqual({ seconds: 2460, freeFlowSeconds: 1920, delaySeconds: 540, meters: 38_200 });
  });

  it("works out the empty-road time when TomTom leaves it out", () => {
    const raw = route(2460, 540, 0);
    delete (raw.routes[0]!.summary as Partial<(typeof raw.routes)[0]["summary"]>).noTrafficTravelTimeInSeconds;
    expect(trimRoute(raw).freeFlowSeconds).toBe(1920);
  });

  it("refuses an answer with no route rather than showing a made-up time", () => {
    expect(() => trimRoute({ routes: [] })).toThrow();
  });

  it("lists each matching address once", () => {
    expect(trimGeocode(geocode)).toEqual([
      { label: "4700 Kingsway, Burnaby BC V5H 4M1", latitude: 49.2276, longitude: -123.0004 },
      { label: "Kingsway, Vancouver BC", latitude: 49.25, longitude: -123.07 },
    ]);
  });
});

describe("commute routes", () => {
  useTestServer({ TOMTOM_API_KEY: "test-key" });
  afterEach(() => {
    vi.unstubAllGlobals();
    clearMemoryCache();
  });

  it("says what's missing before anything is set up", async () => {
    expect((await commuteFeed(defaultConfig())).missing).toBe("places");
    vi.stubEnv("TOMTOM_API_KEY", "");
    expect((await commuteFeed(withPlaces(defaultConfig()))).missing).toBe("key");
  });

  it("reads each place's drive with live traffic, and one failing never hides the others", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = String(input);
        seen.push(url);
        if (url.includes("49.22760,-123.00040")) return Promise.resolve(Response.json(route(2460, 540, 1920)));
        return Promise.resolve(new Response("busy", { status: 503 }));
      }),
    );
    const data = await commuteFeed(withPlaces(defaultConfig()), 1_000);
    expect(data.missing).toBe("");
    expect(data.routes).toEqual([
      {
        id: "work",
        name: "Work",
        emoji: "🏢",
        arriveBy: "",
        seconds: 2460,
        freeFlowSeconds: 1920,
        delaySeconds: 540,
        meters: 38_200,
        at: 1_000,
      },
      { id: "school", name: "School", emoji: "🏫", arriveBy: "08:30" },
    ]);
    const work = new URL(seen.find((u) => u.includes("49.22760"))!);
    expect(work.pathname).toBe("/routing/1/calculateRoute/49.11460,-122.66110:49.22760,-123.00040/json");
    expect(work.searchParams.get("traffic")).toBe("true");
    expect(work.searchParams.get("key")).toBe("test-key");
  });

  it("reads TomTom at most once every five minutes for each place", async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json(route(1800, 0, 1800))));
    vi.stubGlobal("fetch", fetch);
    const config = withPlaces(defaultConfig());
    await commuteFeed(config, 0);
    await commuteFeed(config, 4 * 60_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    await commuteFeed(config, 6 * 60_000);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("serves displays the drive times, never the addresses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json(route(1800, 0, 1800)))),
    );
    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    await saveConfig(LEGACY_ACCOUNT_ID, withPlaces(stored.config), stored.version);
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const r = await displayGET(req("/api/display/commute/", { headers: { "x-display-token": token } }));
    const text = await r.text();
    expect((JSON.parse(text) as CommuteData).routes.map((x) => x.seconds)).toEqual([1800, 1800]);
    expect(text).not.toContain("Kingsway");
    expect(text).not.toContain("49.");
    expect((await displayGET(req("/api/display/commute/"))).status).toBe(401);
  });

  it("looks up addresses for admins only, near the dashboard", async () => {
    const fetch = vi.fn<(input: string | URL | Request) => Promise<Response>>(() => Promise.resolve(Response.json(geocode)));
    vi.stubGlobal("fetch", fetch);
    const url = "/api/admin/commute/?address=4700%20Kingsway%20Burnaby";
    const kid = await cookieFor("kid@example.com");
    expect((await adminGET(req(url, { headers: { cookie: kid } }))).status).toBe(401);
    const admin = await cookieFor("admin@example.com");
    const r = await adminGET(req(url, { headers: { cookie: admin } }));
    expect(((await r.json()) as { matches: unknown[] }).matches).toHaveLength(2);
    const asked = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(asked.pathname).toBe("/search/2/geocode/4700%20Kingsway%20Burnaby.json");
    expect(asked.searchParams.get("lat")).toBe(String(defaultConfig().location.latitude));
    expect(await (await adminGET(req("/api/admin/commute/", { headers: { cookie: admin } }))).json()).toEqual({ ready: true });
  });

  it("tells the admin to add the key before looking anything up", async () => {
    vi.stubEnv("TOMTOM_API_KEY", "");
    const admin = await cookieFor("admin@example.com");
    expect(await (await adminGET(req("/api/admin/commute/", { headers: { cookie: admin } }))).json()).toEqual({ ready: false });
    expect((await adminGET(req("/api/admin/commute/?address=Kingsway", { headers: { cookie: admin } }))).status).toBe(503);
  });
});
