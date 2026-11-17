import type { AlertSeverity } from "@/lib/display/types";

// Alert severities from most to least serious, shared by the server's sorting and the display's banner threshold.
export const SEVERITIES: readonly AlertSeverity[] = ["extreme", "severe", "moderate", "minor"];

export const rank = (s: AlertSeverity) => SEVERITIES.indexOf(s);

/** Whether an alert is serious enough for the red strip, given config.alerts.banner. */
export const meetsBanner = (s: AlertSeverity, banner: AlertSeverity | "never") => banner !== "never" && rank(s) <= rank(banner);

/** Great-circle distance in km. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Ray casting: whether a point is inside a polygon of [lat, lon] pairs. */
export function insidePolygon(lat: number, lon: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i] ?? [0, 0];
    const [yj, xj] = polygon[j] ?? [0, 0];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
