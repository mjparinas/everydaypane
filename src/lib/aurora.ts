// Aurora tonight (Melvin, 2026-11-25). NOAA's planetary Kp says how far south the auroral oval reaches; whether that is
// far enough depends on how far home is from the magnetic pole, not the geographic one. Langley sits at about 54°
// magnetic latitude, which is why Kp 6 or 7 is the usual advice for the Lower Mainland.
//
// The oval's equatorward edge is taken as 68° − 2 × Kp magnetic latitude, a common rule of thumb (Claude's pick,
// 2026-11-25: simple, matches the Kp 6–7 rule locally, and needs nothing beyond the Kp forecast). From the ground an
// aurora about 3° of latitude north still shows low on the northern horizon, and a phone camera, with its long
// exposure, picks up one a little further off still.

const RAD = Math.PI / 180;
// The north geomagnetic (dipole) pole, IGRF-14 for 2025.
const POLE_LAT = 80.8 * RAD;
const POLE_LON = -72.7 * RAD;

export function magneticLatitude(latitude: number, longitude: number): number {
  const lat = latitude * RAD;
  const s = Math.sin(lat) * Math.sin(POLE_LAT) + Math.cos(lat) * Math.cos(POLE_LAT) * Math.cos(longitude * RAD - POLE_LON);
  return Math.asin(Math.max(-1, Math.min(1, s))) / RAD;
}

export type AuroraChance = "good" | "possible" | "slim" | "unlikely";

export const AURORA_CHANCE_LABELS: Record<AuroraChance, string> = {
  good: "Good chance: look north",
  possible: "Possible, low in the northern sky",
  slim: "Slim: a phone camera might catch it",
  unlikely: "Unlikely Tonight",
};

/** Kp needed for each chance at a magnetic latitude (|lat|, so the southern lights work the same way). */
export function kpNeeded(magLat: number): Record<Exclude<AuroraChance, "unlikely">, number> {
  const overhead = (68 - Math.abs(magLat)) / 2;
  return { good: overhead, possible: overhead - 1.5, slim: overhead - 2.5 };
}

export function auroraChance(kp: number, magLat: number): AuroraChance {
  const need = kpNeeded(magLat);
  if (kp >= need.good) return "good";
  if (kp >= need.possible) return "possible";
  if (kp >= need.slim) return "slim";
  return "unlikely";
}

/** NOAA's geomagnetic storm scale: Kp 5 is G1 up to Kp 9 at G5; below 5 there is no storm. */
export function stormLevel(kp: number): number {
  return kp >= 5 ? Math.min(5, Math.floor(kp) - 4) : 0;
}
