import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/display/wildfires/route";
import { defaultConfig } from "@/lib/config/defaults";
import { newWidget } from "@/lib/config/widgets";
import type { WildfireData } from "@/lib/display/types";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { req, useTestServer } from "@/test/server";

import { parseEvacuations } from "./alerts";
import { clearMemoryCache } from "./cache";
import { addDevice } from "./devices";
import { fireName, fireStage, parseFires, ringsToPath, wildfireFeed, type ArcFeature } from "./wildfires";

// Shapes from BC Wildfire Service's public ArcGIS layers (BCWS_ActiveFires_PublicView, BCWS_FirePerimeters_PublicView,
// Evacuation_Orders_and_Alerts), field names as their layer descriptions list them on 2026-11-21. This sandbox can't
// reach ArcGIS Online, so these are written from those descriptions and a sample feature of each.

const NOW = Date.parse("2026-11-21T08:00:00Z");
// The map around Langley at zoom 8: top-left tile 38, 85, so these corners in Web Mercator metres (see radar.test.ts).
const BOX = [-14088873.05, 5948635.29, -13306157.88, 6731350.46] as const;
const MPP = (2 * 20037508.342789244) / 2 ** 8 / 256;
/** Web Mercator metres of a pixel on that map. */
const metres = (x: number, y: number) => [BOX[0] + x * MPP, BOX[3] - y * MPP];
const square = (x: number, y: number, side: number) => [
  [metres(x, y), metres(x + side, y), metres(x + side, y + side), metres(x, y + side), metres(x, y)],
];

const fire = (attributes: Record<string, unknown>): ArcFeature => ({
  attributes: {
    OBJECTID: 1,
    FIRE_NUMBER: "V10123",
    INCIDENT_NAME: "V10123",
    GEOGRAPHIC_DESCRIPTION: "Chilliwack Lake",
    FIRE_STATUS: "Out of Control",
    CURRENT_SIZE: 120.4,
    FIRE_OF_NOTE_IND: "N",
    LATITUDE: 49.08,
    LONGITUDE: -121.45,
    ...attributes,
  },
});

const FIRES = [
  fire({}),
  fire({
    OBJECTID: 2,
    FIRE_NUMBER: "V20001",
    INCIDENT_NAME: "Hope Slide",
    FIRE_STATUS: "Being Held",
    LATITUDE: 49.38,
    LONGITUDE: -121.44,
    FIRE_OF_NOTE_IND: "Y",
    CURRENT_SIZE: 2400,
  }),
  fire({
    OBJECTID: 3,
    FIRE_NUMBER: "V30002",
    GEOGRAPHIC_DESCRIPTION: "Stave Lake",
    FIRE_STATUS: "Under Control",
    LATITUDE: 49.3,
    LONGITUDE: -122.35,
    CURRENT_SIZE: 0.009,
  }),
  fire({ OBJECTID: 4, FIRE_NUMBER: "V40003", FIRE_STATUS: "Out" }),
  // Prince George is well off a Lower Mainland map.
  fire({ OBJECTID: 5, FIRE_NUMBER: "G50004", FIRE_STATUS: "New", LATITUDE: 53.9, LONGITUDE: -122.7 }),
];

/** ArcGIS Online with the three layers; `down` makes one of them answer with an error. */
function arcgis(opts: { down?: "fires" | "perimeters" } = {}) {
  const seen: URL[] = [];
  const fetch = vi.fn((input: string | URL | Request) => {
    const url = new URL(String(input));
    seen.push(url);
    if (url.pathname.includes("BCWS_ActiveFires_PublicView")) {
      if (opts.down === "fires") return Promise.resolve(Response.json({ error: { code: 500, message: "Unable to complete operation." } }));
      return Promise.resolve(Response.json({ features: FIRES }));
    }
    if (url.pathname.includes("BCWS_FirePerimeters_PublicView")) {
      if (opts.down === "perimeters") return Promise.resolve(new Response("down", { status: 503 }));
      return Promise.resolve(
        Response.json({ features: [{ attributes: { FIRE_NUMBER: "V10123" }, geometry: { rings: square(900, 700, 12) } }] }),
      );
    }
    if (url.pathname.includes("Evacuation_Orders_and_Alerts")) {
      return Promise.resolve(
        Response.json({
          features: [
            { attributes: { ORDER_ALERT_STATUS: "Order" }, geometry: { rings: square(880, 680, 40) } },
            { attributes: { ORDER_ALERT_STATUS: "Alert" }, geometry: { rings: square(860, 660, 80) } },
            { attributes: { ORDER_ALERT_STATUS: "All Clear" }, geometry: { rings: square(100, 100, 10) } },
          ],
        }),
      );
    }
    return Promise.resolve(new Response("unexpected", { status: 500 }));
  });
  vi.stubGlobal("fetch", fetch);
  return { fetch, seen };
}

const withWidget = (zoom = 8) => {
  const config = defaultConfig();
  config.views[0]!.widgets = [{ ...newWidget("wildfires", "wf", { x: 0, y: 0 }), zoom }];
  return config;
};

describe("wildfire parsing", () => {
  it("reads BC Wildfire Service's stages of control, and leaves fires that are out", () => {
    expect(fireStage("Out of Control")).toBe("outOfControl");
    expect(fireStage("Being Held")).toBe("held");
    expect(fireStage("Under Control")).toBe("underControl");
    expect(fireStage("New")).toBe("new");
    expect(fireStage("Out")).toBeNull();
    expect(fireStage("")).toBeNull();
    expect(fireStage("Fire of Note")).toBe("outOfControl");
  });

  it("names a fire by its incident name, else its place, else its number", () => {
    expect(fireName({ FIRE_NUMBER: "K71234", INCIDENT_NAME: "Kookipi Creek", GEOGRAPHIC_DESCRIPTION: "Boston Bar" })).toBe("Kookipi Creek");
    expect(fireName({ FIRE_NUMBER: "G30109", INCIDENT_NAME: "G30109", GEOGRAPHIC_DESCRIPTION: "Blackman Rd" })).toBe("Blackman Rd");
    expect(fireName({ FIRE_NUMBER: "G30109" })).toBe("G30109");
  });

  it("puts active fires on the map around home, nearest first", () => {
    const fires = parseFires(FIRES, defaultConfig(), 8);
    expect(fires.map((f) => [f.id, f.stage, f.km])).toEqual([
      ["V30002", "underControl", 31],
      ["V10123", "outOfControl", 88],
      ["V20001", "held", 94],
    ]);
    expect(fires[1]).toMatchObject({ name: "Chilliwack Lake", ha: 120.4, ofNote: false });
    expect(fires[2]).toMatchObject({ name: "Hope Slide", ofNote: true });
    // East of home (710, 718) on the map, and inside it.
    expect(fires[1]!.x).toBeGreaterThan(710);
    expect(fires[1]!.x).toBeLessThan(1280);
  });

  it("turns polygons into SVG paths in map pixels, dropping specks", () => {
    expect(ringsToPath(square(900, 700, 12), BOX, 8)).toBe("M900 700L912 700L912 712L900 712Z");
    expect(ringsToPath(square(900, 700, 0.2), BOX, 8)).toBe("");
    expect(ringsToPath(undefined, BOX, 8)).toBe("");
  });
});

describe("the wildfire feed", () => {
  useTestServer();
  afterEach(() => {
    vi.unstubAllGlobals();
    clearMemoryCache();
  });

  it("asks only for the widget's map, and sends displays pixels, never coordinates", async () => {
    const { seen } = arcgis();
    const data = await wildfireFeed(withWidget(8), NOW);
    const m = data.maps["8"]!;
    expect(m).toMatchObject({ x: 38, y: 85, homeX: 710, homeY: 718 });
    expect(m.fires.map((f) => f.id)).toEqual(["V30002", "V10123", "V20001"]);
    expect(m.perimeters).toEqual(["M900 700L912 700L912 712L900 712Z"]);
    expect(m.evacuations.map((e) => e.kind)).toEqual(["order", "alert"]);
    expect(data.error).toBeUndefined();
    const fires = seen.find((u) => u.pathname.includes("ActiveFires"))!;
    expect(fires.searchParams.get("geometry")).toBe("-14088873,5948635,-13306158,6731350");
    expect(fires.searchParams.get("inSR")).toBe("3857");
    expect(fires.searchParams.get("where")).toBe("FIRE_STATUS <> 'Out'");
    expect(seen.find((u) => u.pathname.includes("Perimeters"))!.searchParams.get("maxAllowableOffset")).toBe("611");
    expect(JSON.stringify(data)).not.toContain("49.1");
    expect(JSON.stringify(data)).not.toContain("-121.45");
  });

  it("keeps the fires when the perimeters are down, and reads each layer at most every five minutes", async () => {
    const { fetch } = arcgis({ down: "perimeters" });
    const data = await wildfireFeed(withWidget(8), NOW);
    expect(data.maps["8"]!.fires).toHaveLength(3);
    expect(data.maps["8"]!.perimeters).toEqual([]);
    await wildfireFeed(withWidget(8), NOW + 60_000);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("says when the fires can't be read", async () => {
    arcgis({ down: "fires" });
    const data = await wildfireFeed(withWidget(9), NOW);
    expect(data.maps).toEqual({});
    expect(data.error).toContain("Unable to complete operation");
  });

  it("answers displays with their token only", async () => {
    arcgis();
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    expect((await GET(req("/api/display/wildfires/"))).status).toBe(401);
    const r = await GET(req("/api/display/wildfires/", { headers: { "x-display-token": token } }));
    expect(r.status).toBe(200);
    expect(Object.keys(((await r.json()) as WildfireData).maps)).toEqual(["7"]);
  });
});

describe("evacuation alerts", () => {
  const langley = { lat: 49.1044, lon: -122.6604 };
  // EmergencyInfoBC's layer in EPSG:4326: rings of [longitude, latitude].
  const box = (lon: number, lat: number, d: number) => [
    [
      [lon - d, lat - d],
      [lon + d, lat - d],
      [lon + d, lat + d],
      [lon - d, lat + d],
      [lon - d, lat - d],
    ],
  ];
  const evac = (status: string, rings: number[][][], extra: Record<string, unknown> = {}): ArcFeature => ({
    attributes: {
      EMRG_OAA_SYSID: 41,
      EVENT_NAME: "Glen Valley Wildfire",
      EVENT_TYPE: "Fire",
      ORDER_ALERT_NAME: "Glen Valley",
      ORDER_ALERT_STATUS: status,
      ISSUING_AGENCY: "Township of Langley",
      MULTI_SOURCED_HOMES: 120,
      DATE_MODIFIED: NOW - 3_600_000,
      ...extra,
    },
    geometry: { rings },
  });

  it("makes an order covering the home extreme, and an alert severe", () => {
    const [order] = parseEvacuations([evac("Order", box(langley.lon, langley.lat, 0.02))], langley, 10, NOW);
    expect(order).toMatchObject({
      id: "evac:41",
      source: "evacuations",
      severity: "extreme",
      title: "Evacuation order here: Glen Valley",
      area: "Glen Valley Wildfire",
      description: "Fire. 120 homes. Issued by Township of Langley. Leave the area now.",
      sent: NOW - 3_600_000,
    });
    expect(parseEvacuations([evac("Alert", box(langley.lon, langley.lat, 0.02))], langley, 10, NOW)[0]?.severity).toBe("severe");
  });

  it("counts ones nearby within the distance, less seriously, and ignores the rest", () => {
    // About 8 km east of home.
    const near = box(langley.lon + 0.12, langley.lat, 0.02);
    const [order] = parseEvacuations([evac("Tactical Evacuation", near)], langley, 10, NOW);
    expect(order).toMatchObject({ severity: "moderate", title: "Evacuation order nearby: Glen Valley" });
    expect(order?.description).toContain("About 8 km away.");
    expect(parseEvacuations([evac("Alert", near)], langley, 10, NOW)[0]?.severity).toBe("minor");
    expect(parseEvacuations([evac("Order", near)], langley, 3, NOW)).toEqual([]);
    expect(parseEvacuations([evac("All Clear", box(langley.lon, langley.lat, 0.02))], langley, 10, NOW)).toEqual([]);
  });

  it("doesn't count a home inside a hole of the area", () => {
    const ring = [...box(langley.lon, langley.lat, 0.05), ...box(langley.lon, langley.lat, 0.01)];
    expect(parseEvacuations([evac("Order", ring)], langley, 0, NOW)).toEqual([]);
  });
});
