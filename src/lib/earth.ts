// The earth wind map (Melvin, 2026-11-21: "can i add this and specific a location? https://earth.nullschool.net"):
// earth.nullschool.net, Cameron Beccario's animated globe of wind and weather, framed in a widget. Everything it shows
// is chosen by the address's hash, so this file only builds that address. Shared by the display and the admin panel.

export const EARTH_ORIGIN = "https://earth.nullschool.net";

/** The colour layer under the wind, by earth's own names. "off" leaves only the moving wind lines. */
export const EARTH_OVERLAYS = [
  "wind",
  "temp",
  "relative_humidity",
  "precip_3hr",
  "total_cloud_water",
  "total_precipitable_water",
  "mean_sea_level_pressure",
  "misery_index",
  "off",
] as const;
export type EarthOverlay = (typeof EARTH_OVERLAYS)[number];

export const EARTH_OVERLAY_LABELS: Record<EarthOverlay, string> = {
  wind: "Wind speed",
  temp: "Temperature",
  relative_humidity: "Humidity",
  precip_3hr: "Rain and snow (3 hours)",
  total_cloud_water: "Clouds",
  total_precipitable_water: "Water in the air",
  mean_sea_level_pressure: "Air pressure",
  misery_index: "Feels like",
  off: "None, wind lines only",
};

/**
 * How close the map is. Earth's zoom is the globe's radius in pixels, so it is worked out from the cell's size on the
 * wall: the same choice frames the same area in a small cell and a large one. Measured on earth itself (2026-11-21):
 * 4 × the cell's short side frames southern B.C. and Washington, 15 × the Lower Mainland.
 */
export const EARTH_ZOOMS = ["globe", "continent", "region", "local"] as const;
export type EarthZoom = (typeof EARTH_ZOOMS)[number];

export const EARTH_ZOOM_LABELS: Record<EarthZoom, string> = {
  globe: "The whole globe",
  continent: "North America",
  region: "B.C. and Washington",
  local: "The Lower Mainland",
};

const ZOOM_FACTOR: Record<EarthZoom, number> = { globe: 0.45, continent: 1.5, region: 4, local: 15 };

export interface EarthView {
  latitude: number;
  longitude: number;
  zoom: EarthZoom;
  overlay: EarthOverlay;
  showPlace: boolean;
  animate: boolean;
}

/** Coordinates to two decimals (about a kilometre): enough to centre the map, and no closer to the house than that. */
const coord = (n: number) => String(Math.round(n * 100) / 100);

/** Earth's address for a view in a cell of the given size (CSS pixels). */
export function earthUrl(v: EarthView, width: number, height: number): string {
  const scale = Math.max(100, Math.round(ZOOM_FACTOR[v.zoom] * Math.max(100, Math.min(width, height))));
  const at = `${coord(v.longitude)},${coord(v.latitude)}`;
  const parts = ["current", "wind", "surface", "level"];
  // Wind speed is earth's own overlay for the wind layer, so it needs no overlay part.
  if (v.overlay !== "wind") parts.push(`overlay=${v.overlay}`);
  parts.push(`orthographic=${at},${scale}`);
  if (v.showPlace) parts.push(`loc=${at}`);
  if (!v.animate) parts.push("anim=off");
  return `${EARTH_ORIGIN}/#${parts.join("/")}`;
}
