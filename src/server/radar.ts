import "server-only";

import type { DashboardConfig } from "@/lib/config/schema";
import type { RadarData, RadarMap, RadarTimes } from "@/lib/display/types";
import { BLOCK, blockBbox, blockOrigin, MAX_ZOOM, MIN_ZOOM, TILE, tilePoint, type Precip } from "@/lib/radar";

import { cached } from "./cache";

// Rain radar (Melvin, 2026-11-21). Environment Canada's North American radar composite through MSC GeoMet's WMS: no
// key, no sign-in, updated every six minutes with the last three hours kept, plus GeoMet's own extrapolation of the
// radar for the short-term forecast. RainViewer's free API, the usual alternative, closed at the start of 2026.
// The map underneath is CARTO's basemap (OpenStreetMap data), with the place names drawn on top of the rain.
//
// Displays never talk to either service: they get the list of picture times here, and every picture through our own
// routes, which build the upstream address themselves from a time this server listed and the dashboard's location.

const GEOMET = "https://geo.weather.gc.ca/geomet";
const LAYERS: Record<Precip, { past: string; forecast: string }> = {
  rain: { past: "RADAR_1KM_RRAI", forecast: "Radar_1km_RainPrecipRate-Extrapolation" },
  snow: { past: "RADAR_1KM_RSNO", forecast: "Radar_1km_SnowPrecipRate-Extrapolation" },
};
const TIMES_TTL = 2 * 60_000;
const WINDOW_MS = 3 * 3_600_000;
const MAX_TIMES = 400;

export const isPrecip = (v: string): v is Precip => v === "rain" || v === "snow";

/** An ISO 8601 duration such as PT6M, PT1H or P1D in milliseconds (0 when it isn't one). */
export function durationMs(d: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(d.trim());
  if (!m) return 0;
  const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = m;
  return ((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60_000 + Number(seconds) * 1000;
}

/**
 * The times in a WMS time dimension: "start/end/PT6M" intervals, single times, or a comma list of either. Only the
 * latest MAX_TIMES are kept, so a long interval can't make a huge list.
 */
export function parseTimes(dimension: string): number[] {
  const out: number[] = [];
  for (const part of dimension.split(",")) {
    const [a = "", b, step] = part.trim().split("/");
    const start = Date.parse(a);
    if (!Number.isFinite(start)) continue;
    if (b === undefined) {
      out.push(start);
      continue;
    }
    const end = Date.parse(b);
    const every = durationMs(step ?? "");
    if (!Number.isFinite(end) || every <= 0 || end < start) continue;
    const first = Math.max(start, end - every * (MAX_TIMES - 1));
    for (let t = end; t >= first; t -= every) out.push(t);
  }
  return [...new Set(out)].sort((x, y) => x - y).slice(-MAX_TIMES);
}

/** The time dimension of a layer from GeoMet's GetCapabilities, filtered to that one layer. */
export function dimensionFrom(xml: string): string {
  const m = /<Dimension\b[^>]*\bname="time"[^>]*>([^<]+)<\/Dimension>/i.exec(xml);
  if (!m?.[1]) throw new Error("Environment Canada listed no radar times");
  return m[1];
}

async function layerTimes(layer: string): Promise<number[]> {
  const url = `${GEOMET}?service=WMS&version=1.3.0&request=GetCapabilities&layer=${encodeURIComponent(layer)}`;
  const { value } = await cached(`radar:times:${layer}`, TIMES_TTL, async () => {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "Everydaypane/1.0" } });
    if (!r.ok) throw new Error(`Environment Canada answered ${r.status}`);
    return parseTimes(dimensionFrom(await r.text()));
  });
  return value;
}

/** The observed pictures of the last three hours, and the forecast ones after the latest of them. */
export async function radarTimes(precip: Precip, now = Date.now()): Promise<RadarTimes> {
  const [past, forecast] = await Promise.allSettled([layerTimes(LAYERS[precip].past), layerTimes(LAYERS[precip].forecast)]);
  if (past.status === "rejected") {
    return { past: [], forecast: [], error: past.reason instanceof Error ? past.reason.message : "Radar is unavailable" };
  }
  const seen = past.value.filter((t) => t <= now + 60_000 && t > now - WINDOW_MS);
  const last = seen.at(-1) ?? now;
  // The forecast failing only loses the forecast: the observed radar still shows.
  const ahead = forecast.status === "fulfilled" ? forecast.value.filter((t) => t > last && t <= last + WINDOW_MS) : [];
  return { past: seen, forecast: ahead };
}

/** The kinds of precipitation and the zooms the dashboard's radar widgets use (rain at zoom 8 when there are none). */
export function radarsIn(config: DashboardConfig): { precips: Precip[]; zooms: number[] } {
  const precips = new Set<Precip>();
  const zooms = new Set<number>();
  for (const v of config.views)
    for (const w of v.widgets)
      if (w.type === "radar") {
        precips.add(w.precip);
        zooms.add(w.zoom);
      }
  return { precips: precips.size ? [...precips] : ["rain"], zooms: zooms.size ? [...zooms] : [8] };
}

/** The map around home at a zoom, to the pixel. */
export function radarMap(config: DashboardConfig, zoom: number): RadarMap {
  const { latitude, longitude } = config.location;
  const o = blockOrigin(latitude, longitude, zoom);
  const p = tilePoint(latitude, longitude, zoom);
  return { x: o.x, y: o.y, homeX: Math.round((p.x - o.x) * TILE), homeY: Math.round((p.y - o.y) * TILE) };
}

export async function radarFeed(config: DashboardConfig, now = Date.now()): Promise<RadarData> {
  const { precips, zooms } = radarsIn(config);
  const layers: RadarData["layers"] = {};
  for (const p of precips) layers[p] = await radarTimes(p, now);
  const maps: RadarData["maps"] = {};
  for (const z of zooms) maps[String(z)] = radarMap(config, z);
  return { updatedAt: now, maps, layers };
}

const isPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const validZoom = (z: number) => Number.isInteger(z) && z >= MIN_ZOOM && z <= MAX_ZOOM;

/** Radar pixels are 1 km, so close zooms get a smaller picture the display stretches: no detail is lost. */
export const framePixels = (zoom: number) => (zoom >= 8 ? (BLOCK * TILE) / 2 : BLOCK * TILE);

/** The GeoMet address of one radar picture covering the map around home. */
export function frameUrl(config: DashboardConfig, precip: Precip, kind: "past" | "forecast", zoom: number, time: number): string {
  const { latitude, longitude } = config.location;
  const bbox = blockBbox(blockOrigin(latitude, longitude, zoom), zoom).map((n) => n.toFixed(2));
  const px = framePixels(zoom);
  const q = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: LAYERS[precip][kind],
    STYLES: "",
    CRS: "EPSG:3857",
    BBOX: bbox.join(","),
    WIDTH: String(px),
    HEIGHT: String(px),
    FORMAT: "image/png",
    TRANSPARENT: "TRUE",
    TIME: new Date(time).toISOString().replace(".000Z", "Z"),
  });
  return `${GEOMET}?${q.toString()}`;
}

/**
 * One radar picture, for a time the server itself listed (anything else is refused, so this can't fetch arbitrary
 * pictures). Observed pictures never change, so browsers keep them a day; forecast ones are redone every few minutes.
 */
export async function radarFrame(
  config: DashboardConfig,
  precip: Precip,
  zoom: number,
  time: number,
  now = Date.now(),
): Promise<Response | null> {
  if (!validZoom(zoom)) return null;
  const times = await radarTimes(precip, now);
  const kind = times.past.includes(time) ? "past" : times.forecast.includes(time) ? "forecast" : null;
  if (!kind) return null;
  const r = await fetch(frameUrl(config, precip, kind, zoom, time), {
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": "Everydaypane/1.0" },
  });
  const bytes = new Uint8Array(await r.arrayBuffer());
  // WMS reports problems as XML, sometimes with a 200, so only a real PNG is passed on.
  if (!r.ok || !isPng(bytes)) {
    console.error(`[radar] ${LAYERS[precip][kind]} at ${new Date(time).toISOString()} answered ${r.status} without a picture`);
    return null;
  }
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": kind === "past" ? "private, max-age=86400, immutable" : "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const MAP_STYLES = ["light_nolabels", "light_only_labels", "dark_nolabels", "dark_only_labels"] as const;
export type MapStyle = (typeof MAP_STYLES)[number];
export const isMapStyle = (v: string): v is MapStyle => (MAP_STYLES as readonly string[]).includes(v);

/** One map tile of the area around home (only those: the route can't be used as a general tile proxy). */
export async function mapTile(config: DashboardConfig, style: MapStyle, zoom: number, x: number, y: number): Promise<Response | null> {
  if (!validZoom(zoom) || !Number.isInteger(x) || !Number.isInteger(y)) return null;
  const o = blockOrigin(config.location.latitude, config.location.longitude, zoom);
  if (x < o.x || x >= o.x + BLOCK || y < o.y || y >= o.y + BLOCK) return null;
  const host = "abcd"[(x + y) % 4] ?? "a";
  const r = await fetch(`https://${host}.basemaps.cartocdn.com/${style}/${zoom}/${x}/${y}.png`, {
    signal: AbortSignal.timeout(10_000),
    headers: { "User-Agent": "Everydaypane/1.0" },
  });
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (!r.ok || !isPng(bytes)) {
    console.error(`[radar] map tile ${style}/${zoom}/${x}/${y} answered ${r.status}`);
    return null;
  }
  return new Response(bytes, {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=604800", "X-Content-Type-Options": "nosniff" },
  });
}
