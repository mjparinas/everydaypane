import "server-only";

import { distanceKm } from "@/lib/alerts";
import type { DashboardConfig } from "@/lib/config/schema";
import type { FireStage, WildfireData, WildfireFire, WildfireMap } from "@/lib/display/types";
import { BLOCK, blockBbox, blockOrigin, MAX_ZOOM, MIN_ZOOM, TILE, tilePoint } from "@/lib/radar";

import { cached } from "./cache";
import { radarMap } from "./radar";

// Wildfires (Melvin, 2026-11-21: "do windy and wildfires"). BC Wildfire Service publishes its active fires, the
// perimeters of their burned areas and EmergencyInfoBC's evacuation orders and alerts as public ArcGIS feature
// services (no key, no sign-in; the same layers its own Wildfire Situation map reads). The server asks each one only
// for the square of map the widget draws (the radar's 5 × 5 tiles around home, src/lib/radar.ts), already simplified
// to a map pixel, and turns everything into pixels on that map, so a display gets small SVG paths and never the
// dashboard's coordinates. The map tiles themselves are the radar's (/api/display/radar/tile/).

const BCWS = "https://services6.arcgis.com/ubm4tcTYICKBpist/arcgis/rest/services";
export const FIRES_URL = `${BCWS}/BCWS_ActiveFires_PublicView/FeatureServer/0/query`;
export const PERIMETERS_URL = `${BCWS}/BCWS_FirePerimeters_PublicView/FeatureServer/0/query`;
export const EVACUATIONS_URL = `${BCWS}/Evacuation_Orders_and_Alerts/FeatureServer/0/query`;

const TTL = 5 * 60_000;
const MAX_FIRES = 300;
const MAX_SHAPES = 150;

export interface ArcFeature {
  attributes?: Record<string, unknown>;
  geometry?: { x?: number; y?: number; rings?: number[][][] };
}

/** One ArcGIS query. ArcGIS reports problems as `{ error }`, often with a 200, so that counts as a failure too. */
export async function arcgisQuery(url: string, params: Record<string, string>, who = "BC Wildfire Service"): Promise<ArcFeature[]> {
  const q = new URLSearchParams({ f: "json", ...params });
  const r = await fetch(`${url}?${q.toString()}`, {
    signal: AbortSignal.timeout(12_000),
    headers: { "User-Agent": "Everydaypane/1.0" },
  });
  if (!r.ok) throw new Error(`${who} answered ${r.status}`);
  const body = (await r.json()) as { features?: unknown; error?: { message?: string } } | null;
  if (body?.error) throw new Error(`${who}: ${body.error.message ?? "error"}`);
  return Array.isArray(body?.features) ? (body.features as ArcFeature[]) : [];
}

/** Envelope parameters for a [minX, minY, maxX, maxY] box in a spatial reference (3857 metres or 4326 degrees). */
export const envelope = (box: readonly number[], sr: "3857" | "4326") => ({
  geometry: box.map((n) => (sr === "3857" ? n.toFixed(0) : n.toFixed(4))).join(","),
  geometryType: "esriGeometryEnvelope",
  inSR: sr,
  spatialRel: "esriSpatialRelIntersects",
  outSR: sr,
});

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

/** BC Wildfire Service's stage of control; "Out" (and anything empty) is not an active fire. */
export function fireStage(status: string): FireStage | null {
  const s = status.toLowerCase();
  if (!s || s === "out") return null;
  if (s === "new") return "new";
  if (s === "being held") return "held";
  if (s === "under control") return "underControl";
  return "outOfControl"; // "Out of Control", and anything unfamiliar, is treated as the most serious
}

/**
 * A fire's name for the wall: the incident name of a named fire ("Kookipi Creek"), otherwise its approximate location
 * ("Blackman Rd"), otherwise its fire number.
 */
export function fireName(a: Record<string, unknown>): string {
  const number = str(a.FIRE_NUMBER);
  const incident = str(a.INCIDENT_NAME);
  const place = str(a.GEOGRAPHIC_DESCRIPTION);
  const name = incident && incident !== number ? incident : place || number || "Wildfire";
  return name.length > 60 ? `${name.slice(0, 59).trimEnd()}…` : name;
}

/** The map pixel of a place, on the map whose top-left tile is `origin`. */
function pixelOf(lat: number, lon: number, zoom: number, origin: { x: number; y: number }) {
  const p = tilePoint(lat, lon, zoom);
  return { x: Math.round((p.x - origin.x) * TILE), y: Math.round((p.y - origin.y) * TILE) };
}

export function parseFires(features: ArcFeature[], config: DashboardConfig, zoom: number): WildfireFire[] {
  const { latitude, longitude } = config.location;
  const origin = blockOrigin(latitude, longitude, zoom);
  const size = BLOCK * TILE;
  const out: WildfireFire[] = [];
  for (const f of features) {
    const a = f.attributes ?? {};
    const stage = fireStage(str(a.FIRE_STATUS));
    const lat = num(a.LATITUDE);
    const lon = num(a.LONGITUDE);
    if (!stage || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const { x, y } = pixelOf(lat, lon, zoom, origin);
    if (x < 0 || y < 0 || x > size || y > size) continue;
    out.push({
      id: str(a.FIRE_NUMBER) || String(a.OBJECTID ?? out.length),
      name: fireName(a),
      stage,
      ha: Math.max(0, Math.round((num(a.CURRENT_SIZE) || 0) * 10) / 10),
      km: Math.round(distanceKm(latitude, longitude, lat, lon)),
      ofNote: str(a.FIRE_OF_NOTE_IND).toUpperCase() === "Y",
      x,
      y,
    });
  }
  return out.sort((p, q) => p.km - q.km).slice(0, MAX_FIRES);
}

/**
 * Polygon rings in Web Mercator metres as SVG path data in pixels of the map with corners `box`. Rings that shrink to
 * fewer than three distinct pixels are dropped, so a far-off speck costs nothing.
 */
export function ringsToPath(rings: number[][][] | undefined, box: readonly number[], zoom: number): string {
  const [minX = 0, , , maxY = 0] = box;
  const metresPerPixel = metresPer(zoom);
  const parts: string[] = [];
  for (const ring of rings ?? []) {
    const pts: string[] = [];
    let last = "";
    for (const pt of ring) {
      const [mx, my] = pt;
      if (typeof mx !== "number" || typeof my !== "number") continue;
      const p = `${Math.round((mx - minX) / metresPerPixel)} ${Math.round((maxY - my) / metresPerPixel)}`;
      if (p !== last) pts.push(p);
      last = p;
    }
    if (pts.length > 1 && pts[0] === pts.at(-1)) pts.pop();
    if (pts.length >= 3) parts.push(`M${pts.join("L")}Z`);
  }
  return parts.join("");
}

/** Web Mercator metres in one map pixel at a zoom. */
const metresPer = (zoom: number) => (2 * 20037508.342789244) / 2 ** zoom / TILE;

const shapeParams = (box: readonly number[], zoom: number) => ({
  ...envelope(box, "3857"),
  returnGeometry: "true",
  maxAllowableOffset: metresPer(zoom).toFixed(0),
  geometryPrecision: "0",
  resultRecordCount: String(MAX_SHAPES),
});

async function mapAt(config: DashboardConfig, zoom: number): Promise<WildfireMap> {
  const { latitude, longitude } = config.location;
  const box = blockBbox(blockOrigin(latitude, longitude, zoom), zoom);
  const [fires, perimeters, evacuations] = await Promise.allSettled([
    arcgisQuery(FIRES_URL, {
      ...envelope(box, "3857"),
      where: "FIRE_STATUS <> 'Out'",
      outFields: "OBJECTID,FIRE_NUMBER,INCIDENT_NAME,GEOGRAPHIC_DESCRIPTION,FIRE_STATUS,CURRENT_SIZE,FIRE_OF_NOTE_IND,LATITUDE,LONGITUDE",
      returnGeometry: "false",
      resultRecordCount: "1000",
    }),
    arcgisQuery(PERIMETERS_URL, { ...shapeParams(box, zoom), where: "FIRE_STATUS <> 'Out'", outFields: "FIRE_NUMBER" }),
    arcgisQuery(EVACUATIONS_URL, {
      ...shapeParams(box, zoom),
      where: "ORDER_ALERT_STATUS <> 'All Clear'",
      outFields: "ORDER_ALERT_STATUS",
    }),
  ]);
  // The fires are the point of the widget; the outlines failing only loses the outlines.
  if (fires.status === "rejected") throw fires.reason;
  for (const r of [perimeters, evacuations]) if (r.status === "rejected") console.error(`[wildfires] ${String(r.reason)}`);
  const shapes = (r: PromiseSettledResult<ArcFeature[]>) => (r.status === "fulfilled" ? r.value : []);
  return {
    ...radarMap(config, zoom),
    fires: parseFires(fires.value, config, zoom),
    perimeters: shapes(perimeters)
      .map((f) => ringsToPath(f.geometry?.rings, box, zoom))
      .filter(Boolean),
    evacuations: shapes(evacuations).flatMap((f) => {
      const kind = evacuationKind(str(f.attributes?.ORDER_ALERT_STATUS));
      const d = ringsToPath(f.geometry?.rings, box, zoom);
      return kind && d ? [{ kind, d }] : [];
    }),
  };
}

/** EmergencyInfoBC's status: an order (or a tactical evacuation, an order given on the spot) or an alert to be ready. */
export function evacuationKind(status: string): "order" | "alert" | null {
  const s = status.toLowerCase();
  if (s === "order" || s === "tactical evacuation") return "order";
  if (s === "alert") return "alert";
  return null;
}

/** The zooms the dashboard's wildfire widgets use (7 when there are none, so the route still answers). */
export function wildfireZooms(config: DashboardConfig): number[] {
  const zooms = new Set<number>();
  for (const v of config.views) for (const w of v.widgets) if (w.type === "wildfires") zooms.add(w.zoom);
  return zooms.size ? [...zooms] : [7];
}

export async function wildfireFeed(config: DashboardConfig, now = Date.now()): Promise<WildfireData> {
  const { latitude, longitude } = config.location;
  const maps: WildfireData["maps"] = {};
  let error: string | undefined;
  for (const zoom of wildfireZooms(config)) {
    if (zoom < MIN_ZOOM || zoom > MAX_ZOOM) continue;
    try {
      const key = `wildfires:${latitude.toFixed(3)},${longitude.toFixed(3)}:${zoom}`;
      maps[String(zoom)] = (await cached(key, TTL, () => mapAt(config, zoom), now)).value;
    } catch (e) {
      error = e instanceof Error ? e.message : "Wildfires are unavailable";
      console.error(`[wildfires] zoom ${zoom}: ${error}`);
    }
  }
  return error ? { updatedAt: now, maps, error } : { updatedAt: now, maps };
}
