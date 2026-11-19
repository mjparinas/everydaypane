import { afterEach, describe, expect, it, vi } from "vitest";

import { meetsBanner } from "@/lib/alerts";
import { defaultConfig } from "@/lib/config/defaults";
import { useTestServer } from "@/test/server";

import { alertsFeed, decodeXml, parseHydro, parseNaad, parseOpen511, parseQuakes } from "./alerts";
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
