// Mountain snow report (Melvin, 2026-11-25): the local hills and a few B.C. and Washington resorts, read from
// Open-Meteo at each mountain's coordinates and a mid-mountain elevation (no key). Kept free of zod so the display, the
// admin panel and the server can all import it.

export interface Mountain {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Metres. Open-Meteo downscales temperature and snowfall to it instead of the model's smoothed valley height. */
  elevation: number;
}

export const MOUNTAINS = [
  { id: "cypress", name: "Cypress", latitude: 49.396, longitude: -123.204, elevation: 1200 },
  { id: "grouse", name: "Grouse", latitude: 49.38, longitude: -123.082, elevation: 1150 },
  { id: "seymour", name: "Seymour", latitude: 49.367, longitude: -122.948, elevation: 1150 },
  { id: "whistler", name: "Whistler", latitude: 50.066, longitude: -122.947, elevation: 1800 },
  { id: "sasquatch", name: "Sasquatch", latitude: 49.379, longitude: -121.937, elevation: 1200 },
  { id: "manning", name: "Manning Park", latitude: 49.096, longitude: -120.889, elevation: 1550 },
  { id: "baker", name: "Mt. Baker", latitude: 48.857, longitude: -121.668, elevation: 1300 },
  { id: "sunPeaks", name: "Sun Peaks", latitude: 50.883, longitude: -119.891, elevation: 1800 },
] as const satisfies readonly Mountain[];

export type MountainId = (typeof MOUNTAINS)[number]["id"];
export const MOUNTAIN_IDS = MOUNTAINS.map((m) => m.id) as [MountainId, ...MountainId[]];
export const DEFAULT_MOUNTAINS: MountainId[] = ["cypress", "grouse", "seymour", "whistler"];

export function mountainById(id: string): Mountain | undefined {
  return MOUNTAINS.find((m) => m.id === id);
}

/** A snowfall or depth in centimetres as the wall shows it: whole centimetres, or inches with one decimal under 10. */
export function snowAmount(cm: number, unit: "cm" | "in"): string {
  if (unit === "cm") return `${Math.round(cm)}`;
  const inches = cm / 2.54;
  return inches < 10 ? `${Math.round(inches * 10) / 10}` : `${Math.round(inches)}`;
}

/** "Thu" for a YYYY-MM-DD day. */
export function weekday(day: string): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${day}T12:00:00Z`).getUTCDay()] ?? "";
}
