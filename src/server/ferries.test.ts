import { afterEach, describe, expect, it, vi } from "vitest";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";

import { GET } from "@/app/api/display/ferries/route";
import { defaultConfig } from "@/lib/config/defaults";
import type { DashboardConfig } from "@/lib/config/schema";
import { newWidget } from "@/lib/config/widgets";
import type { FerriesData } from "@/lib/display/types";
import { req, useTestServer } from "@/test/server";

import { clearMemoryCache } from "./cache";
import { loadConfig, saveConfig } from "./config";
import { addDevice } from "./devices";
import { ferriesFeed, ferryRoutesInUse, to24h, trimCapacity } from "./ferries";

// The community BC Ferries API's /v2/capacity/ answer, in the shape of its published JSON schema
// (schemas/bc-ferries-api-v2-capacity-schema.json); this sandbox can't reach bcferriesapi.ca.
const sailing = (over: Record<string, unknown>) => ({
  time: "7:00 am",
  arrivalTime: "8:35 am",
  sailingStatus: "future",
  status: "scheduled",
  fill: 0,
  carFill: 0,
  oversizeFill: 0,
  vesselName: "Spirit of British Columbia",
  vesselStatus: "",
  capacityKnown: true,
  carCapacityKnown: true,
  ...over,
});
const answer = {
  routes: [
    {
      routeCode: "TSASWB",
      fromTerminalCode: "TSA",
      toTerminalCode: "SWB",
      sailingDuration: "1h 35m",
      dataStatus: "available",
      sailings: [
        sailing({ time: "5:15 am", sailingStatus: "past", status: "arrived", actualDepartureTime: "5:17 am", fill: 30 }),
        sailing({ time: "7:00 am", sailingStatus: "current", status: "departed", actualDepartureTime: "7:02 am", fill: 64 }),
        sailing({ time: "9:00 am", arrivalTime: "10:35 am", fill: 92, carFill: 97 }),
        sailing({ time: "11:00 am", arrivalTime: "12:35 pm", fill: 41, carFill: 38, vesselName: "Coastal Celebration" }),
        sailing({ time: "1:00 pm", sailingStatus: "cancelled", status: "cancelled", fill: 0, statusText: "Cancelled due to weather" }),
        sailing({
          time: "3:00 pm",
          arrivalTime: "Variable",
          status: "delayed",
          delayMinutes: 25,
          capacityKnown: false,
          carCapacityKnown: false,
          vesselStatus: "Delayed due to heavy traffic",
        }),
        { time: "not a time", arrivalTime: "" },
      ],
    },
    {
      routeCode: "HSBNAN",
      fromTerminalCode: "HSB",
      toTerminalCode: "NAN",
      sailingDuration: "1h 40m",
      dataStatus: "no-service",
      sailings: [],
    },
  ],
  meta: { schemaVersion: "2", generatedAt: "2026-11-21T15:00:00Z", stale: false, complete: true, sources: {} },
};

function withFerries(routes: ("TSASWB" | "HSBNAN" | "SWBTSA")[]): DashboardConfig {
  const c = defaultConfig();
  c.views[0]!.widgets = [{ ...newWidget("ferries", "fe", { x: 0, y: 0 }), routes }];
  return c;
}

describe("ferry data", () => {
  it("reads BC Ferries' times as 24-hour Pacific times", () => {
    expect(to24h("12:05 am")).toBe("00:05");
    expect(to24h("9:00 am")).toBe("09:00");
    expect(to24h("12:30 pm")).toBe("12:30");
    expect(to24h("8:20 PM")).toBe("20:20");
  });

  it("keeps sailings that haven't left, with how full they are, and calls out cancellations and delays", () => {
    const [route, noService] = trimCapacity(answer, ["TSASWB", "HSBNAN"]);
    expect(route).toMatchObject({ code: "TSASWB", name: "Tsawwassen → Swartz Bay", duration: "1h 35m", status: "" });
    expect(route!.sailings).toEqual([
      { time: "09:00", arrive: "10:35", state: "scheduled", fill: 92, carFill: 97, vessel: "Spirit of British Columbia", note: "" },
      { time: "11:00", arrive: "12:35", state: "scheduled", fill: 41, carFill: 38, vessel: "Coastal Celebration", note: "" },
      { time: "13:00", arrive: "08:35", state: "cancelled", vessel: "Spirit of British Columbia", note: "Cancelled due to weather" },
      {
        time: "15:00",
        arrive: "",
        state: "delayed",
        vessel: "Spirit of British Columbia",
        delayMinutes: 25,
        note: "Delayed due to heavy traffic",
      },
    ]);
    expect(noService).toMatchObject({ code: "HSBNAN", status: "no-service", sailings: [] });
  });

  it("refuses the API's 'data down' answer rather than showing no sailings as if there were none", () => {
    expect(() => trimCapacity("BC Ferries Data Currently Down", ["TSASWB"])).toThrow();
  });

  it("asks only for the routes on a ferries widget", () => {
    const c = withFerries(["TSASWB", "HSBNAN"]);
    c.views[0]!.widgets.push({ ...newWidget("ferries", "fe2", { x: 0, y: 3 }), routes: ["TSASWB", "SWBTSA"] });
    expect(ferryRoutesInUse(c)).toEqual(["TSASWB", "HSBNAN", "SWBTSA"]);
    expect(ferryRoutesInUse(defaultConfig())).toEqual([]);
  });
});

describe("ferry route", () => {
  useTestServer({});
  afterEach(() => {
    vi.unstubAllGlobals();
    clearMemoryCache();
  });

  it("reads BC Ferries once for every widget, and serves the last good copy when it fails", async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json(answer)));
    vi.stubGlobal("fetch", fetch);
    const config = withFerries(["HSBNAN", "TSASWB"]);
    const first = await ferriesFeed(config, 1_000);
    expect(first.routes.map((r) => r.code)).toEqual(["HSBNAN", "TSASWB"]);
    expect(first).toMatchObject({ down: false, at: 1_000 });
    await ferriesFeed(config, 60_000);
    expect(fetch).toHaveBeenCalledTimes(1);

    fetch.mockImplementation(() => Promise.resolve(Response.json("BC Ferries Data Currently Down")));
    const later = await ferriesFeed(config, 10 * 60_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(later).toMatchObject({ down: false, at: 1_000 });
    expect(later.routes).toHaveLength(2);
  });

  it("says so when BC Ferries has never been read, and reads nothing without a ferries widget", async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response("busy", { status: 503 })));
    vi.stubGlobal("fetch", fetch);
    expect(await ferriesFeed(defaultConfig())).toMatchObject({ down: false, routes: [] });
    expect(fetch).not.toHaveBeenCalled();
    expect(await ferriesFeed(withFerries(["TSASWB"]))).toMatchObject({ down: true, routes: [] });
  });

  it("answers displays only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json(answer))),
    );
    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    const c = structuredClone(stored.config);
    c.views[0]!.widgets = withFerries(["TSASWB"]).views[0]!.widgets;
    await saveConfig(LEGACY_ACCOUNT_ID, c, stored.version);
    expect((await GET(req("/api/display/ferries/"))).status).toBe(401);
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const r = await GET(req("/api/display/ferries/", { headers: { "x-display-token": token } }));
    expect(r.status).toBe(200);
    const data = (await r.json()) as FerriesData;
    expect(data.routes[0]!.sailings[0]).toMatchObject({ time: "09:00", fill: 92 });
  });
});
