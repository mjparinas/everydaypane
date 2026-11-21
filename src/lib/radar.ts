// The rain radar's map geometry, shared by the server (which asks Environment Canada for radar pictures of exactly this
// area, src/server/radar.ts) and the display (which lays the map tiles and pictures on top of each other). Everything
// is in Web Mercator map tiles, 256 pixels square, so the radar lines up with the map beneath it.

/** The map is a square of BLOCK × BLOCK tiles with home in the middle tile. */
export const BLOCK = 5;
export const TILE = 256;
export const MIN_ZOOM = 6;
export const MAX_ZOOM = 10;

export type Precip = "rain" | "snow";

/** Where a place falls in the tile grid at a zoom: whole numbers are tile edges. */
export function tilePoint(latitude: number, longitude: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const lat = (Math.max(-85, Math.min(85, latitude)) * Math.PI) / 180;
  return {
    x: ((longitude + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n,
  };
}

/** The top-left tile of the map around home. */
export function blockOrigin(latitude: number, longitude: number, zoom: number): { x: number; y: number } {
  const p = tilePoint(latitude, longitude, zoom);
  const half = Math.floor(BLOCK / 2);
  return { x: Math.floor(p.x) - half, y: Math.floor(p.y) - half };
}

const HALF_WORLD = 20037508.342789244; // metres from the centre of the Web Mercator world to its edge

/** The map's corners in EPSG:3857 metres: [minX, minY, maxX, maxY]. */
export function blockBbox(origin: { x: number; y: number }, zoom: number): [number, number, number, number] {
  const size = (2 * HALF_WORLD) / 2 ** zoom;
  const minX = -HALF_WORLD + origin.x * size;
  const maxY = HALF_WORLD - origin.y * size;
  return [minX, maxY - BLOCK * size, minX + BLOCK * size, maxY];
}
