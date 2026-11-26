import { afterEach, describe, expect, it, vi } from "vitest";

import { meetsBanner } from "@/lib/alerts";
import { defaultConfig } from "@/lib/config/defaults";
import { useTestServer } from "@/test/server";

import {
  alertsFeed,
  decodeXml,
  parse511,
  parseEpcor,
  parseHydro,
  parseHydroQuebec,
  parseNaad,
  parseNws,
  parseOpen511,
  parseQuakes,
  parseUsgs,
  trim511,
} from "./alerts";
import { clearMemoryCache } from "./cache";

const langley = { lat: 49.1044, lon: -122.6604 };
const now = Date.parse("2026-11-17T06:00:00Z");

// A square around Langley and one far away in the Yukon, as "lat lon lat lon …" like NAAD's GeoRSS.
const aroundLangley = "49.0 -122.8 49.0 -122.4 49.25 -122.4 49.25 -122.8 49.0 -122.8";
const dempster = "64.34 -137.83 64.34 -137.91 64.4 -137.91 64.4 -137.83 64.34 -137.83";

function entry(o: { id: string; title: string; author: string; polygon: string; terms: string[]; summary: string; updated?: string }) {
  return `<entry>
  <id>tag:rss.naad-adna.pelmorex.com,2026-11-17:feed.atom/${o.id}</id>
  <title>${o.title}</title>
  <updated>${o.updated ?? "2026-11-17T05:30:00-00:00"}</updated>
  <author><name>${o.author}</name></author>
  <link rel="alternate" href="http://capcp2.naad-adna.pelmorex.com/x.xml"/>
  <georss:polygon>${o.polygon}</georss:polygon>
  <summary type="html">${o.summary}</summary>
  ${o.terms.map((t) => `<category term="${t}"/>`).join("\n  ")}
</entry>`;
}

const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:georss="http://www.georss.org/georss">
<title>Pelmorex - NAADS Alerts RSS feed</title>
${entry({
  id: "urn:oid:2.49.0.1.124.1111.2026",
  title: "orange warning - rainfall - in effect",
  author: "Environment Canada",
  polygon: aroundLangley,
  terms: ["status=Actual", "msgType=Alert", "severity=Severe", "language=en-CA"],
  summary:
    "Description: Rainfall amounts of 80 to 100 mm are expected.&lt;br&gt;Expires: 2026-11-18T06:00:00-00:00&lt;br&gt;Area: Metro Vancouver - southeast including Langley",
})}
${entry({
  id: "urn:oid:2.49.0.1.124.1112.2026",
  title: "avertissement orange - pluie - en vigueur",
  author: "Environnement Canada",
  polygon: aroundLangley,
  terms: ["status=Actual", "msgType=Alert", "severity=Severe", "language=fr-CA"],
  summary: "Description: Pluie.",
})}
${entry({
  id: "urn:oid:2.49.0.1.124.2222.2026",
  title: "yellow warning - blizzard - in effect",
  author: "Environment Canada",
  polygon: dempster,
  terms: ["status=Actual", "msgType=Update", "severity=Moderate"],
  summary: "Description: Blizzard.&lt;br&gt;Area: Dempster",
})}
${entry({
  id: "urn:oid:2.49.0.1.124.3333.2026",
  title: "Civil emergency",
  author: "Emergency Management BC",
  polygon: aroundLangley,
  terms: ["status=Test", "msgType=Alert", "severity=Extreme"],
  summary: "Description: This is a test.",
})}
${entry({
  id: "urn:oid:2.49.0.1.124.4444.2026",
  title: "orange warning - wind - ended",
  author: "Environment Canada",
  polygon: aroundLangley,
  terms: ["status=Actual", "msgType=Update", "severity=Severe"],
  summary: "Description: Ended.",
})}
${entry({
  id: "urn:oid:2.49.0.1.124.5555.2026",
  title: "Evacuation order",
  author: "Township of Langley",
  polygon: aroundLangley,
  terms: ["status=Actual", "msgType=Alert", "severity=Extreme"],
  summary:
    "Description: Leave the Glen Valley area now &amp; head to higher ground.&lt;br&gt;Expires: 2026-11-17T05:00:00-00:00&lt;br&gt;Area: Glen Valley",
})}
</feed>`;

describe("NAAD alerts (Alert Ready and Environment Canada)", () => {
  it("keeps current English alerts covering the location, and drops tests, French copies, ended and expired ones", () => {
    const alerts = parseNaad(feed, langley, now);
    expect(alerts).toEqual([
      {
        id: "naad:urn:oid:2.49.0.1.124.1111.2026",
        source: "weather",
        severity: "severe",
        title: "Orange warning - rainfall - in effect",
        area: "Metro Vancouver - southeast including Langley",
        description: "Rainfall amounts of 80 to 100 mm are expected.",
        sent: Date.parse("2026-11-17T05:30:00Z"),
        expires: Date.parse("2026-11-18T06:00:00Z"),
      },
    ]);
  });

  it("decodes XML entities", () => {
    expect(decodeXml("Fish &amp; chips &lt;3 &#39;yes&#39; &#x2014;")).toBe("Fish & chips <3 'yes' —");
  });
});

describe("DriveBC road events", () => {
  const events = {
    events: [
      {
        id: "drivebc.ca/DBC-1",
        headline: "INCIDENT",
        event_type: "INCIDENT",
        severity: "MAJOR",
        description: "Highway 1 closed both directions at 232 St due to flooding.",
        updated: "2026-11-17T05:10:00-07:00",
        roads: [{ name: "Highway 1", state: "CLOSED" }],
        geography: { type: "Point", coordinates: [-122.58, 49.15] },
      },
      {
        id: "drivebc.ca/DBC-2",
        headline: "CONSTRUCTION",
        event_type: "CONSTRUCTION",
        severity: "MINOR",
        roads: [{ name: "Fraser Highway", state: "ALL_LANES_OPEN" }],
        geography: { type: "Point", coordinates: [-122.6, 49.1] },
      },
      {
        id: "drivebc.ca/DBC-3",
        headline: "WEATHER_CONDITION",
        event_type: "WEATHER_CONDITION",
        severity: "MINOR",
        description: "Compact snow.",
        roads: [{ name: "Highway 3" }],
        geography: {
          type: "LineString",
          coordinates: [
            [-121.1, 49.3],
            [-121.0, 49.35],
          ],
        },
      },
    ],
  };

  it("keeps major events and weather conditions within the radius", () => {
    const near = parseOpen511(events, langley, 50);
    expect(near.map((a) => [a.id, a.severity, a.title])).toEqual([["drivebc:drivebc.ca/DBC-1", "severe", "Highway 1: closed"]]);
    // Highway 3 near Manning Park is about 120 km away.
    const wide = parseOpen511(events, langley, 150);
    expect(wide.map((a) => a.title)).toEqual(["Highway 1: closed", "Highway 3: Weather condition"]);
  });
});

describe("Earthquakes Canada", () => {
  const text = [
    "#EventID|Time|Latitude|Longitude|Depth/km|MagType|Magnitude|EventLocationName",
    "ca2026a|2026-11-17T03:12:00.000Z|48.9|-123.4|52.1|Mw|4.8|20 km SE of Duncan, BC, felt/20 km SE de Duncan, BC, ressenti",
    "ca2026b|2026-11-16T18:29:27.000Z|49.2131|-66.8596|14.56|Mw|5.2|28 km WNW of Sainte-Anne-des-Monts, QC/28 km ONO de Sainte-Anne-des-Monts, QC",
    "ca2026c|2026-11-17T02:00:00.000Z|49.2|-122.9|10|ML|2.4|Near Burnaby, BC/Près de Burnaby, BC",
  ].join("\n");

  it("keeps earthquakes within the radius and above the magnitude, in English", () => {
    const quakes = parseQuakes(text, langley, 150, 3);
    expect(quakes).toHaveLength(1);
    expect(quakes[0]).toMatchObject({
      id: "quake:ca2026a",
      severity: "moderate",
      title: "Magnitude 4.8 earthquake",
      area: "20 km SE of Duncan, BC, felt",
    });
    expect(quakes[0]?.description).toMatch(/^\d+ km away, 52 km deep\.$/);
  });
});

describe("BC Hydro outages", () => {
  // The shape of BC Hydro's outage map data (outages-map-data.json): times in epoch ms, polygons as flat lon, lat lists.
  // This sandbox can't reach bchydro.com, so these are recorded shapes.
  const square = (lat: number, lon: number, d: number) => [lon - d, lat - d, lon + d, lat - d, lon + d, lat + d, lon - d, lat + d];
  const outages = [
    {
      id: 101,
      municipality: "Langley",
      area: "Walnut Grove",
      cause: "Tree down across our wires",
      numCustomersOut: 2412,
      crewStatusDescription: "Crew on-site",
      crewEtr: Date.parse("2026-11-17T09:30:00Z"),
      showEtr: true,
      dateOff: Date.parse("2026-11-17T05:10:00Z"),
      dateOn: null,
      lastUpdated: Date.parse("2026-11-17T05:40:00Z"),
      latitude: 49.104,
      longitude: -122.66,
      polygon: square(49.1044, -122.6604, 0.01),
    },
    {
      id: 102,
      municipality: "Surrey",
      area: "Cloverdale",
      numCustomersOut: 40,
      crewStatusDescription: "Crew on their way",
      dateOn: null,
      lastUpdated: 0,
      latitude: 49.11,
      longitude: -122.7,
      polygon: square(49.11, -122.7, 0.002),
    },
    { id: 103, municipality: "Prince George", area: "Hart", numCustomersOut: 5000, latitude: 54.02, longitude: -123.09, polygon: [] },
    {
      id: 104,
      municipality: "Langley",
      area: "Murrayville",
      numCustomersOut: 900,
      dateOn: Date.parse("2026-11-17T05:00:00Z"),
      latitude: 49.1,
      longitude: -122.65,
      polygon: [],
    },
  ];

  it("keeps outages covering the home or nearby, and leaves out restored and faraway ones", () => {
    const list = parseHydro(outages, langley, 5, "America/Vancouver", now);
    expect(list.map((a) => [a.id, a.severity, a.title])).toEqual([
      ["bchydro:101", "severe", "Power outage here: 2,412 customers"],
      ["bchydro:102", "minor", "Power outage nearby: 40 customers"],
    ]);
    expect(list[0]).toMatchObject({ source: "power", area: "Walnut Grove, Langley", expires: null });
    expect(list[0]?.description).toBe("Tree down across our wires. Crew on-site. Power back by about Tue 2:30 a.m.");
    expect(list[1]).toMatchObject({ area: "Cloverdale, Surrey", description: "Crew on their way." });
  });

  it("marks a big nearby outage moderate, and ignores anything that isn't a list", () => {
    const big = { ...outages[1], numCustomersOut: 1200 };
    expect(parseHydro([big], langley, 5, "America/Vancouver", now)[0]?.severity).toBe("moderate");
    expect(parseHydro([big], langley, 1, "America/Vancouver", now)).toEqual([]);
    expect(parseHydro({ error: "nope" }, langley, 5, "America/Vancouver", now)).toEqual([]);
  });
});

const seattle = { lat: 47.6062, lon: -122.3321 };
const montreal = { lat: 45.5019, lon: -73.5674 };

// Shapes from api.weather.gov's documentation (GeoJSON, properties per CAP) and USGS's GeoJSON summary format.
const nws = {
  features: [
    {
      id: "https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.a",
      properties: {
        id: "urn:oid:2.49.0.1.840.0.a",
        areaDesc: "City of Seattle",
        sent: "2026-11-17T04:00:00-08:00",
        expires: "2026-11-17T12:00:00-08:00",
        ends: "2026-11-18T04:00:00-08:00",
        status: "Actual",
        messageType: "Alert",
        severity: "Severe",
        event: "Wind Warning",
        headline: "Wind Warning issued November 17",
        description: "South winds 30 to 40 mph.",
        instruction: "Secure loose objects.",
      },
    },
    { properties: { id: "t", status: "Test", event: "Test Message", severity: "Minor" } },
    { properties: { id: "c", status: "Actual", messageType: "Cancel", event: "Flood Watch", severity: "Moderate" } },
    { properties: { id: "old", status: "Actual", event: "Frost Advisory", severity: "Minor", ends: "2026-11-16T08:00:00-08:00" } },
    { properties: { id: "u", status: "Actual", event: "Special Weather Statement", severity: "Unknown" } },
  ],
};

describe("National Weather Service alerts", () => {
  it("keeps actual alerts, drops tests, cancellations and ended ones, and counts Unknown as minor", () => {
    const list = parseNws(nws, now);
    expect(list.map((a) => [a.id, a.source, a.severity, a.title])).toEqual([
      ["nws:urn:oid:2.49.0.1.840.0.a", "weather", "severe", "Wind Warning"],
      ["nws:u", "weather", "minor", "Special Weather Statement"],
    ]);
    expect(list[0]?.description).toBe("Wind Warning issued November 17 South winds 30 to 40 mph. Secure loose objects.");
    expect(list[0]?.expires).toBe(Date.parse("2026-11-18T12:00:00Z"));
    expect(parseNws(null, now)).toEqual([]);
  });
});

describe("USGS earthquakes", () => {
  it("keeps earthquakes within the radius and above the magnitude", () => {
    const raw = {
      features: [
        {
          id: "uw1",
          properties: { mag: 4.6, place: "10 km N of Seattle, WA", time: now - 3_600_000 },
          geometry: { coordinates: [-122.33, 47.7, 22] },
        },
        { id: "uw2", properties: { mag: 2.1, place: "Small", time: now }, geometry: { coordinates: [-122.3, 47.6, 5] } },
        { id: "ak1", properties: { mag: 6.0, place: "Alaska", time: now }, geometry: { coordinates: [-151.9, 62.0, 100] } },
        { id: "bad", properties: { mag: null }, geometry: { coordinates: [] } },
      ],
    };
    const list = parseUsgs(raw, seattle, 100, 3);
    expect(list.map((a) => [a.id, a.severity, a.area])).toEqual([["usgs:uw1", "moderate", "10 km N of Seattle, WA"]]);
    expect(list[0]?.description).toBe("10 km away, 22 km deep.");
  });
});

describe("Hydro-Québec outages", () => {
  // Rows as the outage map sends them (checked 2026-11-26): customers, start, estimated end, I or P, "[lon, lat]", codes.
  const raw = {
    messages: {},
    pannes: [
      [1200, "2026-11-25 13:14:20", "2026-11-25 16:15:00", "I", "[-73.57, 45.505]", "L", "6", "61", "5290", ""],
      [13, "2026-11-25 14:00:00", "", "P", "[-73.6, 45.52]", "A", "", "", "7011", ""],
      [400, "2026-11-25 14:00:00", "", "I", "[-71.589, 46.697]", "A", "", "", "1000", ""],
      [5, "2026-11-25 14:00:00", "", "I", "not json", "A", "", "", "", ""],
      "junk",
    ],
  };

  it("keeps outages near home, very close ones severe, and says when power is due back", () => {
    const list = parseHydroQuebec(raw, montreal, 5, false);
    expect(list.map((a) => [a.severity, a.title])).toEqual([
      ["severe", "Power outage here: 1,200 customers"],
      ["minor", "Planned power interruption: 13 customers"],
    ]);
    expect(list[0]?.description).toBe("Power back by about Wed 16:15.");
    expect(list[1]?.area).toBe("Hydro-Québec, about 3 km away");
    expect(list[1]?.description).toBe("No estimate yet for when power is back.");
    expect(parseHydroQuebec({}, montreal, 5, false)).toEqual([]);
  });
});

describe("Ontario 511 and 511 Alberta road events", () => {
  const toronto = { lat: 43.6532, lon: -79.3832 };
  const t = Math.floor(now / 1000);
  const events = trim511([
    {
      ID: 1,
      RoadwayName: "HWY 401",
      DirectionOfTravel: "Eastbound",
      Description: "Collision, all  lanes closed",
      EventType: "accidentsAndIncidents",
      IsFullClosure: true,
      Severity: "Unknown",
      Latitude: 43.7,
      Longitude: -79.4,
      LastUpdated: t - 600,
    },
    {
      ID: 2,
      RoadwayName: "Gardiner Expy",
      EventType: "roadwork",
      IsFullClosure: true,
      Latitude: 43.64,
      Longitude: -79.39,
      StartDate: t - 3600,
    },
    { ID: 3, RoadwayName: "DVP", EventType: "roadwork", IsFullClosure: true, Latitude: 43.7, Longitude: -79.35, StartDate: t + 3600 },
    { ID: 4, RoadwayName: "Yonge St", EventType: "roadwork", IsFullClosure: false, Severity: "Minor", Latitude: 43.66, Longitude: -79.38 },
    {
      ID: 5,
      RoadwayName: "HWY 11",
      EventType: "accidentsAndIncidents",
      EventSubType: "jackknifed truck",
      IsFullClosure: false,
      Severity: "Major",
      Latitude: 43.65,
      Longitude: -79.4,
    },
    { ID: 6, RoadwayName: "HWY 17", EventType: "closures", IsFullClosure: true, Latitude: 48.4, Longitude: -89.2 },
    { ID: 7, RoadwayName: "No place" },
  ]);

  it("keeps closures and major incidents nearby, unplanned closures severe, planned work only once it has started", () => {
    const list = parse511(events, "ontario511", toronto, 100, now);
    expect(list.map((a) => [a.id, a.severity, a.title])).toEqual([
      ["on511:1", "severe", "HWY 401 eastbound: closed"],
      ["on511:2", "moderate", "Gardiner Expy: closed"],
      ["on511:5", "moderate", "HWY 11: Jackknifed truck"],
    ]);
    expect(list[0]).toMatchObject({ source: "roads", description: "Collision, all lanes closed", sent: (t - 600) * 1000 });
    expect(list[0]?.area).toMatch(/^Ontario 511, about \d+ km away$/);
    expect(parse511(events, "alberta511", toronto, 100, now)[0]?.id).toBe("ab511:1");
    expect(trim511({ error: "bad key" })).toEqual([]);
  });
});

describe("EPCOR outages", () => {
  const edmonton = { lat: 53.5461, lon: -113.4938 };
  const square = (lat: number, lon: number, d: number) => [
    [
      [lon - d, lat - d],
      [lon + d, lat - d],
      [lon + d, lat + d],
      [lon - d, lat + d],
      [lon - d, lat - d],
    ],
  ];
  const features = [
    {
      attributes: { id: "A1", affcusts: "12", cause: "Under review", estresto: "Nov-26 5:30 PM", nbhoods: "Oliver" },
      geometry: { rings: square(edmonton.lat, edmonton.lon, 0.01) },
    },
    { attributes: { id: "A2", affcusts: 1500, cause: "Equipment failure." }, geometry: { rings: square(53.57, -113.49, 0.005) } },
    { attributes: { id: "A3", affcusts: 3 }, geometry: { rings: square(53.9, -113.49, 0.005) } },
    { attributes: { id: "A4" } },
  ];

  it("grades outages covering the home and nearby, and says when power is due back", () => {
    const list = parseEpcor(features, edmonton, 5, now);
    expect(list.map((a) => [a.id, a.severity])).toEqual([
      ["epcor:A1", "severe"],
      ["epcor:A2", "moderate"],
    ]);
    expect(list[0]).toMatchObject({
      title: "Power outage here: 12 customers",
      area: "Oliver",
      description: "Under review. Power back by about Nov-26 5:30 PM.",
    });
    expect(list[1]?.description).toBe("Equipment failure. No estimate yet for when power is back.");
  });
});

describe("the alerts feed", () => {
  useTestServer();
  afterEach(() => {
    vi.unstubAllGlobals();
    clearMemoryCache();
  });

  it("combines every source, most serious first, and survives one being down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = String(input);
        if (url.startsWith("https://rss.naad-adna.pelmorex.com/")) return Promise.resolve(new Response(feed));
        if (url.startsWith("https://api.open511.gov.bc.ca/")) return Promise.resolve(new Response("down", { status: 503 }));
        if (url.startsWith("https://earthquakescanada.nrcan.gc.ca/"))
          return Promise.resolve(
            new Response(
              "#EventID|Time|Latitude|Longitude|Depth/km|MagType|Magnitude|EventLocationName\nq1|2026-11-17T04:00:00.000Z|49.0|-122.7|20|Mw|5.6|Near Langley, BC/Près de Langley, BC",
            ),
          );
        if (url === "https://www.bchydro.com/power-outages/app/outages-map-data.json")
          return Promise.resolve(Response.json([{ id: 7, area: "Brookswood", numCustomersOut: 12, latitude: 49.09, longitude: -122.65 }]));
        return Promise.resolve(new Response("unexpected", { status: 500 }));
      }),
    );
    const data = await alertsFeed(defaultConfig(), now);
    expect(data.alerts.map((a) => [a.source, a.severity])).toEqual([
      ["weather", "severe"],
      ["earthquakes", "severe"],
      ["power", "minor"],
    ]);
  });

  it("reads the National Weather Service and USGS for a U.S. home, and nothing from B.C. or NAAD", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        seen.push(url);
        if (url.startsWith("https://api.weather.gov/alerts/active?")) {
          // NWS turns away readers that don't name themselves.
          expect(new Headers(init?.headers).get("user-agent")).toContain("everydaypane.com");
          return Promise.resolve(Response.json(nws));
        }
        if (url.startsWith("https://earthquake.usgs.gov/")) return Promise.resolve(Response.json({ features: [] }));
        return Promise.resolve(new Response("unexpected", { status: 500 }));
      }),
    );
    const config = defaultConfig();
    config.location = { name: "Seattle", latitude: seattle.lat, longitude: seattle.lon, timeZone: "America/Los_Angeles" };
    const data = await alertsFeed(config, now);
    expect(data.alerts.map((a) => a.id)).toEqual(["nws:urn:oid:2.49.0.1.840.0.a", "nws:u"]);
    expect(seen.map((u) => new URL(u).host).sort()).toEqual(["api.weather.gov", "earthquake.usgs.gov"]);
    expect(seen.find((u) => u.includes("usgs"))).toContain("maxradiuskm=100");
  });

  it("reads Hydro-Québec's current file for a Québec home, by the version it names", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = String(input);
        seen.push(url);
        if (url.endsWith("/bisversion.json")) return Promise.resolve(Response.json("20261125155020"));
        if (url.endsWith("/bismarkers20261125155020.json"))
          return Promise.resolve(Response.json({ pannes: [[40, "2026-11-25 13:00:00", "", "I", "[-73.57, 45.503]"]] }));
        if (url.startsWith("https://rss.naad-adna.pelmorex.com/")) return Promise.resolve(new Response("<feed></feed>"));
        if (url.startsWith("https://earthquakescanada.nrcan.gc.ca/")) return Promise.resolve(new Response(""));
        return Promise.resolve(new Response("unexpected", { status: 500 }));
      }),
    );
    const config = defaultConfig();
    config.location = { name: "Montréal", latitude: montreal.lat, longitude: montreal.lon, timeZone: "America/Toronto" };
    const data = await alertsFeed(config, now);
    expect(data.alerts.map((a) => [a.source, a.severity])).toEqual([["power", "severe"]]);
    expect(seen.some((u) => u.includes("bchydro") || u.includes("open511") || u.includes("arcgis"))).toBe(false);
  });

  it("reads 511 Alberta and EPCOR for an Edmonton home, and skips 511 quietly without a key", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = String(input);
        seen.push(url);
        if (url.startsWith("https://511.alberta.ca/api/v2/get/event?"))
          return Promise.resolve(
            Response.json([
              { ID: 9, RoadwayName: "Anthony Henday Dr", EventType: "closures", IsFullClosure: true, Latitude: 53.55, Longitude: -113.5 },
            ]),
          );
        if (url.includes("/ocps_prod_av/")) return Promise.resolve(Response.json({ features: [] }));
        if (url.startsWith("https://rss.naad-adna.pelmorex.com/")) return Promise.resolve(new Response("<feed></feed>"));
        if (url.startsWith("https://earthquakescanada.nrcan.gc.ca/")) return Promise.resolve(new Response(""));
        return Promise.resolve(new Response("unexpected", { status: 500 }));
      }),
    );
    const config = defaultConfig();
    config.location = { name: "Edmonton", latitude: 53.5461, longitude: -113.4938, timeZone: "America/Edmonton" };
    expect((await alertsFeed(config, now)).alerts).toEqual([]);
    expect(seen.some((u) => u.includes("511.alberta.ca"))).toBe(false);
    expect(seen.some((u) => u.includes("ocps_prod_av"))).toBe(true);

    clearMemoryCache();
    vi.stubEnv("ALBERTA_511_KEY", "k1");
    const data = await alertsFeed(config, now);
    expect(data.alerts.map((a) => [a.id, a.severity])).toEqual([["ab511:9", "severe"]]);
    expect(seen.find((u) => u.includes("511.alberta.ca"))).toContain("key=k1");
    expect(seen.some((u) => u.includes("bchydro") || u.includes("open511"))).toBe(false);
    vi.unstubAllEnvs();
  });

  it("returns nothing when alerts are off", async () => {
    const config = defaultConfig();
    config.alerts.enabled = false;
    expect((await alertsFeed(config, now)).alerts).toEqual([]);
  });

  it("decides which alerts get the red strip", () => {
    expect(meetsBanner("severe", "moderate")).toBe(true);
    expect(meetsBanner("minor", "moderate")).toBe(false);
    expect(meetsBanner("extreme", "never")).toBe(false);
  });
});
