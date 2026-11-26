import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultConfig } from "@/lib/config/defaults";
import { newWidget } from "@/lib/config/widgets";

import { parseCsv, parseRealtime, riversFeed, riverStations, titleCase } from "./rivers";

// Shapes from MSC GeoMet's OGC API `hydrometric-realtime` collection and the Datamart's hydrometric CSV, as MSC
// documents them; this sandbox can't reach either host.
const now = Date.parse("2026-11-25T20:00:00Z");
const feature = (iso: string, level: number | null, discharge: number | null) => ({
  type: "Feature",
  properties: {
    IDENTIFIER: `08MH024.${iso}`,
    STATION_NUMBER: "08MH024",
    STATION_NAME: "FRASER RIVER AT MISSION",
    PROV_TERR_STATE_LOC: "BC",
    DATETIME: iso,
    LEVEL: level,
    DISCHARGE: discharge,
  },
  geometry: { type: "Point", coordinates: [-122.29, 49.13] },
});
const api = {
  type: "FeatureCollection",
  features: [
    feature("2026-11-25T19:55:00Z", 2.512, null),
    feature("2026-11-25T13:55:00Z", 2.43, null),
    feature("2026-11-24T19:55:00Z", 2.3, null),
    { properties: { DATETIME: "not a date" } },
  ],
};
const csv = [
  "ID,Date,Water Level / Niveau d'eau (m),Grade,Symbol / Symbole,QA/QC,Discharge / Débit (cms),Grade,Symbol / Symbole,QA/QC",
  "08MH090,2026-11-25T05:00:00-08:00,1.204,,,1,3.51,,,1",
  "08MH090,2026-11-25T11:00:00-08:00,1.25,,,1,,,,1",
  "08MH090,garbage",
].join("\n");

describe("river feed parsing", () => {
  it("reads the OGC API's features and names the station in title case", () => {
    const r = parseRealtime(api);
    expect(r.name).toBe("Fraser River at Mission");
    expect(r.readings).toHaveLength(3);
    expect(r.readings[0]).toEqual({ t: Date.parse("2026-11-25T19:55:00Z"), level: 2.512, discharge: null });
    expect(parseRealtime({}).readings).toEqual([]);
  });

  it("reads the Datamart CSV by its headers", () => {
    const r = parseCsv(csv);
    expect(r).toEqual([
      { t: Date.parse("2026-11-25T13:00:00Z"), level: 1.204, discharge: 3.51 },
      { t: Date.parse("2026-11-25T19:00:00Z"), level: 1.25, discharge: null },
    ]);
    expect(parseCsv("nothing,here\n1,2")).toEqual([]);
  });

  it("title-cases names but keeps small words small", () => {
    expect(titleCase("SALMON RIVER AT 72 AVENUE, LANGLEY")).toBe("Salmon River at 72 Avenue, Langley");
    expect(titleCase("COQUITLAM RIVER ABOVE ALOUETTE")).toBe("Coquitlam River above Alouette");
  });
});

describe("river feed", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists each station on a widget once", () => {
    const c = defaultConfig();
    const view = c.views[0]!;
    view.widgets.push(newWidget("rivers", "r1", { x: 0, y: 0 }), newWidget("rivers", "r2", { x: 3, y: 0 }));
    expect(riverStations(c)).toEqual(["08MH024", "08MH090", "08MH155"]);
  });

  it("falls back to the Datamart CSV when the API fails, and one station failing never hides the others", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("STATION_NUMBER=08MH024")) return new Response(JSON.stringify(api), { status: 200 });
      if (url.includes("api.weather.gc.ca")) return new Response("busy", { status: 503 });
      if (url.includes("BC_08MH090_")) return new Response(csv, { status: 200 });
      return new Response("missing", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const c = defaultConfig();
    c.views[0]!.widgets.push(newWidget("rivers", "rf", { x: 0, y: 0 }));
    const feed = await riversFeed(c, now);
    const [mission, salmon, nicomekl] = feed.stations;
    expect(mission).toMatchObject({ id: "08MH024", name: "Fraser River at Mission", level: 2.512, trend: "rising" });
    expect(mission!.change6h).toBeCloseTo(0.082, 3);
    expect(mission!.change24h).toBeCloseTo(0.212, 3);
    expect(salmon).toMatchObject({ id: "08MH090", name: "Salmon River at 72 Avenue, Langley", level: 1.25, discharge: 3.51 });
    expect(nicomekl).toMatchObject({ id: "08MH155", level: null });
    expect(nicomekl!.error).toBeTruthy();
  });
});
