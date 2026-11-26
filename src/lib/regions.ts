import { insidePolygon } from "./alerts";
import type { TransitAgencyId } from "./transitAgencies";

// Regional packs (Melvin, 2026-11-26: "Do 1, 2, 3, 4", item 3 being "a regional pack for other cities, so the local
// strength scales beyond the Lower Mainland"). The dashboard's location picks a pack (or Settings › Location picks one
// by hand, `config.region`), and the pack says which local sources apply there: the national alert feed (Alert Ready
// through NAAD in Canada, the National Weather Service in the U.S.), the earthquake catalogue, the province's road
// events, power outages and evacuation orders, and the transit agencies the departures widget offers first.
//
// The borders here are coarse polygons, good to a few kilometres: enough to tell Toronto from Buffalo, not Windsor from
// Detroit. A household right on a border picks its region in Settings. Shared by the server (which sources to read)
// and the household panel (which toggles to show, and what to call them), so it has no zod or server imports.

export const REGION_IDS = [
  "lowerMainland",
  "victoria",
  "bc",
  "calgary",
  "edmonton",
  "alberta",
  "toronto",
  "ontario",
  "quebec",
  "halifax",
  "canada",
  "seattle",
  "us",
  "other",
] as const;
export type RegionId = (typeof REGION_IDS)[number];
export type RegionSetting = RegionId | "auto";

export type Country = "CA" | "US" | "other";

/** National alert feed: NAAD carries Alert Ready and Environment Canada; NWS carries U.S. watches and warnings. */
export type NationalAlerts = "naad" | "nws" | null;
export type QuakeCatalogue = "nrcan" | "usgs";
export type PowerSource = "bcHydro" | "hydroQuebec" | "epcor" | null;
/** Road events: DriveBC needs nothing; Ontario 511 and 511 Alberta need Everydaypane's own developer key. */
export type RoadSource = "driveBC" | "ontario511" | "alberta511" | null;
export type EvacuationSource = "emergencyInfoBC" | null;

export interface Region {
  id: RegionId;
  /** For Settings: "Metro Vancouver and the Fraser Valley". */
  name: string;
  country: Country;
  alerts: NationalAlerts;
  quakes: QuakeCatalogue;
  roads: RoadSource;
  power: PowerSource;
  evacuations: EvacuationSource;
  /** Agencies the departures widget offers first, the most likely first. */
  transit: readonly TransitAgencyId[];
  /** Widgets whose data only covers this kind of place, beyond the transit widget. */
  localWidgets: readonly string[];
}

const CANADA = {
  country: "CA",
  alerts: "naad",
  quakes: "nrcan",
  roads: null,
  power: null,
  evacuations: null,
  transit: [],
  localWidgets: [],
} as const;
const BC_SOURCES = { roads: "driveBC", power: "bcHydro", evacuations: "emergencyInfoBC" } as const;
const BC_WIDGETS = ["ferries", "drivebc", "wildfires"];
const US = {
  country: "US",
  alerts: "nws",
  quakes: "usgs",
  roads: null,
  power: null,
  evacuations: null,
  transit: [],
  localWidgets: [],
} as const;

export const REGIONS: Record<RegionId, Region> = {
  lowerMainland: {
    ...CANADA,
    ...BC_SOURCES,
    id: "lowerMainland",
    name: "Metro Vancouver and the Fraser Valley",
    transit: ["translink"],
    localWidgets: [...BC_WIDGETS, "borderWait", "garbage"],
  },
  victoria: {
    ...CANADA,
    ...BC_SOURCES,
    id: "victoria",
    name: "Greater Victoria",
    transit: ["bcTransitVictoria"],
    localWidgets: BC_WIDGETS,
  },
  bc: { ...CANADA, ...BC_SOURCES, id: "bc", name: "British Columbia", transit: [], localWidgets: BC_WIDGETS },
  calgary: { ...CANADA, id: "calgary", name: "Calgary", roads: "alberta511", transit: ["calgary"] },
  // EPCOR serves the city of Edmonton; ENMAX (Calgary) and FortisAlberta publish no outage feed (checked 2026-11-26).
  edmonton: { ...CANADA, id: "edmonton", name: "Edmonton", roads: "alberta511", power: "epcor", transit: ["edmonton"] },
  alberta: { ...CANADA, id: "alberta", name: "Alberta", roads: "alberta511" },
  toronto: { ...CANADA, id: "toronto", name: "Toronto", roads: "ontario511", transit: ["ttc"] },
  // Hydro One and Toronto Hydro publish no outage feed anyone may read (checked 2026-11-26).
  ontario: { ...CANADA, id: "ontario", name: "Ontario", roads: "ontario511" },
  quebec: { ...CANADA, id: "quebec", name: "Québec", power: "hydroQuebec" },
  halifax: { ...CANADA, id: "halifax", name: "Halifax", transit: ["halifax"] },
  canada: { ...CANADA, id: "canada", name: "Elsewhere in Canada" },
  seattle: { ...US, id: "seattle", name: "Seattle and King County", transit: ["kingCounty"] },
  us: { ...US, id: "us", name: "Elsewhere in the United States" },
  // USGS lists earthquakes worldwide; nothing else here knows the place.
  other: { ...US, country: "other", alerts: null, id: "other", name: "Outside Canada and the U.S." },
};

type Poly = [number, number][];

// [lat, lon] outlines. Canada's southern border, the Alaska boundary and the coasts, simplified.
const CANADA_POLY: Poly = [
  [48.3, -125.5],
  [48.25, -123.6],
  [48.3, -123.25],
  [48.45, -123.2],
  [48.7, -123.25],
  [48.83, -123.0],
  [49.0, -123.32],
  [49.0, -95.15],
  [48.6, -93.4],
  [48.0, -89.6],
  [47.6, -87.0],
  [46.9, -85.0],
  [46.5, -84.4],
  [46.0, -83.5],
  [45.3, -82.5],
  [43.0, -82.42],
  [42.55, -82.6],
  [42.33, -83.06],
  [42.05, -83.15],
  [41.7, -82.7],
  [42.2, -81.5],
  [42.88, -78.93],
  [43.25, -79.05],
  [43.45, -79.0],
  [43.6, -77.0],
  [44.1, -76.4],
  [44.4, -75.8],
  [45.0, -74.7],
  [45.0, -71.5],
  [45.3, -71.0],
  [46.4, -70.0],
  [47.45, -69.2],
  [47.3, -68.5],
  [47.1, -67.8],
  [45.9, -67.8],
  [45.6, -67.4],
  [45.1, -67.2],
  [44.7, -66.9],
  [43.5, -66.5],
  [42.0, -60.0],
  [46.0, -48.0],
  [60.0, -55.0],
  [70.0, -60.0],
  [84.0, -60.0],
  [84.0, -141.0],
  [60.3, -141.0],
  [59.6, -137.5],
  [59.6, -135.0],
  [58.6, -133.4],
  [56.8, -131.8],
  [55.9, -130.0],
  [54.7, -130.6],
  [54.5, -133.5],
  [52.0, -132.0],
];

// The lower 48 (Canada is checked first, so the northern edge can be loose), Alaska and Hawaii.
const US_POLYS: Poly[] = [
  [
    [49.5, -125.5],
    [49.5, -66.5],
    [44.5, -66.5],
    [40.5, -69.5],
    [35.0, -75.0],
    [30.0, -80.5],
    [25.0, -79.8],
    [24.3, -81.5],
    [25.0, -83.0],
    [29.5, -85.5],
    [29.0, -89.0],
    [29.0, -94.0],
    [25.95, -97.15],
    [27.5, -99.5],
    [28.7, -100.5],
    [29.8, -101.4],
    [29.0, -103.1],
    [29.76, -104.4],
    [31.78, -106.53],
    [31.78, -108.2],
    [31.33, -108.2],
    [31.33, -111.07],
    [32.72, -114.72],
    [32.53, -117.1],
    [32.5, -117.3],
    [34.0, -121.0],
    [40.0, -125.0],
  ],
  [
    [72.0, -141.0],
    [72.0, -170.0],
    [51.0, -180.0],
    [51.0, -150.0],
    [54.5, -133.5],
    [54.7, -130.6],
    [55.9, -130.0],
    [56.8, -131.8],
    [58.6, -133.4],
    [59.6, -135.0],
    [59.6, -137.5],
    [60.3, -141.0],
  ],
  [
    [23.0, -161.0],
    [23.0, -154.0],
    [18.5, -154.0],
    [18.5, -161.0],
  ],
];

// British Columbia: the Alberta border follows the Rockies north to 60° N, the Yukon border is 60° N.
const BC_POLY: Poly = [
  [47.5, -127.0],
  [48.3, -123.0],
  [49.0, -123.0],
  [49.0, -114.06],
  [50.3, -114.7],
  [51.2, -115.9],
  [51.4, -116.3],
  [52.2, -117.5],
  [52.85, -118.5],
  [53.8, -120.0],
  [60.0, -120.0],
  [60.0, -139.1],
  [55.9, -130.0],
  [54.5, -133.5],
  [52.0, -133.0],
];

// Québec: the Ottawa River and 79.5° W to the west, the 45th parallel and Maine to the south, the Gulf and Labrador
// roughly to the east.
const QUEBEC_POLY: Poly = [
  [45.0, -74.67],
  [45.0, -71.5],
  [45.3, -71.0],
  [46.4, -70.0],
  [47.45, -69.2],
  [47.9, -68.3],
  [48.0, -67.0],
  [48.0, -65.0],
  [48.5, -64.0],
  [49.5, -60.0],
  [51.4, -57.1],
  [52.0, -57.1],
  [52.0, -64.0],
  [55.0, -66.5],
  [60.4, -64.6],
  [62.6, -77.0],
  [55.0, -79.5],
  [47.5, -79.5],
  [46.7, -79.1],
  [46.3, -78.7],
  [45.8, -77.1],
  [45.43, -75.7],
  [45.55, -74.4],
  [45.15, -74.35],
];

// Alberta: the 49th parallel, 110° W to Saskatchewan, 60° N, and the Rockies (B.C.'s border above) to the west.
const ALBERTA_POLY: Poly = [
  [49.0, -110.0],
  [60.0, -110.0],
  [60.0, -120.0],
  [53.8, -120.0],
  [52.85, -118.5],
  [52.2, -117.5],
  [51.4, -116.3],
  [51.2, -115.9],
  [50.3, -114.7],
  [49.0, -114.06],
];

// Ontario, as a box: Manitoba's border (95.15° W) to the Ottawa River, the Great Lakes to Hudson Bay. Québec is checked
// first, so the box can run past the Ottawa River; the Canada outline keeps it out of the U.S.
const ONTARIO_BOX: [number, number, number, number] = [41.6, -95.16, 57.0, -74.3];

/** [south, west, north, east] around each metro area, inside its country. */
const METRO_BOXES: [RegionId, [number, number, number, number]][] = [
  // Squamish and Bowen Island to Hope, the border to the North Shore mountains.
  ["lowerMainland", [48.95, -123.5, 49.75, -121.3]],
  // The Capital Regional District: Sooke to Sidney, the Saanich Peninsula and the Western Communities.
  ["victoria", [48.3, -123.75, 48.75, -123.2]],
  ["calgary", [50.75, -114.4, 51.3, -113.8]],
  ["edmonton", [53.3, -113.85, 53.8, -113.2]],
  // Toronto and the inner GTA (the TTC runs inside the city; GO and the 905 agencies aren't in this pack yet).
  ["toronto", [43.55, -79.7, 43.9, -79.1]],
  ["halifax", [44.4, -64.1, 45.05, -63.2]],
  ["seattle", [47.08, -122.55, 47.8, -121.05]],
];

const inBox = (lat: number, lon: number, [s, w, n, e]: [number, number, number, number]) => lat >= s && lat <= n && lon >= w && lon <= e;

/** The region a point is in, from the outlines above. */
export function regionAt(lat: number, lon: number): RegionId {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "other";
  const country: Country = insidePolygon(lat, lon, CANADA_POLY) ? "CA" : US_POLYS.some((p) => insidePolygon(lat, lon, p)) ? "US" : "other";
  if (country === "other") return "other";
  const metro = METRO_BOXES.find(([id, box]) => REGIONS[id].country === country && inBox(lat, lon, box))?.[0];
  if (metro) return metro;
  if (country === "US") return "us";
  if (insidePolygon(lat, lon, BC_POLY)) return "bc";
  if (insidePolygon(lat, lon, ALBERTA_POLY)) return "alberta";
  if (insidePolygon(lat, lon, QUEBEC_POLY)) return "quebec";
  if (inBox(lat, lon, ONTARIO_BOX)) return "ontario";
  return "canada";
}

/** The pack a dashboard uses: the one Settings picked, else the one its location is in. */
export function regionOf(config: { region?: RegionSetting; location: { latitude: number; longitude: number } }): Region {
  const id = config.region && config.region !== "auto" ? config.region : regionAt(config.location.latitude, config.location.longitude);
  return REGIONS[id];
}

/** What each alert source toggle is called in a region, or null where nothing feeds it there (the toggle is hidden). */
export function alertSourceLabels(
  r: Region,
): Record<"alertReady" | "weather" | "roads" | "earthquakes" | "power" | "evacuations", string | null> {
  return {
    alertReady: r.alerts === "naad" ? "Alert Ready (public emergencies)" : null,
    weather:
      r.alerts === "naad"
        ? "Environment Canada weather warnings"
        : r.alerts === "nws"
          ? "National Weather Service watches and warnings"
          : null,
    roads:
      r.roads === "driveBC"
        ? "DriveBC road events"
        : r.roads === "ontario511"
          ? "Ontario 511 road events"
          : r.roads === "alberta511"
            ? "511 Alberta road events"
            : null,
    earthquakes: r.quakes === "nrcan" ? "Earthquakes (Earthquakes Canada)" : "Earthquakes (USGS)",
    power:
      r.power === "bcHydro"
        ? "BC Hydro power outages"
        : r.power === "hydroQuebec"
          ? "Hydro-Québec power outages"
          : r.power === "epcor"
            ? "EPCOR power outages (Edmonton)"
            : null,
    evacuations: r.evacuations === "emergencyInfoBC" ? "Evacuation orders and alerts (EmergencyInfoBC)" : null,
  };
}
