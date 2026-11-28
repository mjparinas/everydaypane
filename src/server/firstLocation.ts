import "server-only";

import type { DashboardConfig } from "@/lib/config/schema";

import { saveConfig } from "./config";

// A new household's weather starts where they are (Melvin, 2026-11-28: shorten the time to the first "wow"). The
// starter settings say Langley, BC, which is right for Melvin and wrong for most families, and a wall with someone
// else's weather is the first thing a new family sees. On the first visit to /household/, before anything is saved,
// Vercel's own geolocation headers for the visitor's IP set the place, time zone and units. A city is as close as it
// gets (never an address), and Settings › Location still changes it.

const DEFAULT = { name: "Langley, BC", latitude: 49.1044, longitude: -122.6604 };

export interface IpPlace {
  name: string;
  latitude: number;
  longitude: number;
  timeZone: string;
  country: string;
}

/** The visitor's city from Vercel's headers, or null off Vercel or when a header is missing or odd. */
export function placeFromHeaders(h: Headers): IpPlace | null {
  const lat = Number(h.get("x-vercel-ip-latitude"));
  const lon = Number(h.get("x-vercel-ip-longitude"));
  const tz = h.get("x-vercel-ip-timezone") ?? "";
  const country = (h.get("x-vercel-ip-country") ?? "").toUpperCase();
  let city = "";
  try {
    city = decodeURIComponent(h.get("x-vercel-ip-city") ?? "").trim();
  } catch {
    return null;
  }
  const region = (h.get("x-vercel-ip-country-region") ?? "").toUpperCase();
  if (!city || !Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  if (!/^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)+$/.test(tz)) return null;
  const where = region && /^[A-Z0-9]{1,3}$/.test(region) ? region : country;
  return {
    name: `${city.slice(0, 50)}${where ? `, ${where}` : ""}`,
    latitude: Math.round(lat * 1e4) / 1e4,
    longitude: Math.round(lon * 1e4) / 1e4,
    timeZone: tz,
    country,
  };
}

/** True while the settings have never been saved and still carry the starter's Langley location. */
export function untouchedStarter(config: DashboardConfig, version: number): boolean {
  const l = config.location;
  return version === 0 && l.name === DEFAULT.name && l.latitude === DEFAULT.latitude && l.longitude === DEFAULT.longitude;
}

/** The starter settings moved to the visitor's place (and °F for the U.S.), or null when there's nothing to change. */
export function localise(config: DashboardConfig, place: IpPlace): DashboardConfig | null {
  if (place.name === DEFAULT.name) return null;
  const next = structuredClone(config);
  next.location = { ...next.location, name: place.name, latitude: place.latitude, longitude: place.longitude, timeZone: place.timeZone };
  if (place.country === "US") next.units = "imperial";
  // The starter's clock and date say Vancouver too; they follow the household's own city.
  const city = place.name.split(",")[0] ?? place.name;
  for (const view of next.views)
    for (const w of view.widgets) {
      if (w.type === "clock" && w.timeZone === "America/Vancouver")
        Object.assign(w, { timeZone: place.timeZone, label: city.slice(0, 30) });
      if (w.type === "date" && w.timeZone === "America/Vancouver") Object.assign(w, { timeZone: place.timeZone });
    }
  return next;
}

/** Saves the localised starter once; a race with the household's own first save simply loses (version 0 only). */
export async function localiseFirstVisit(accountId: string, config: DashboardConfig, version: number, h: Headers) {
  if (!untouchedStarter(config, version)) return null;
  const place = placeFromHeaders(h);
  const next = place ? localise(config, place) : null;
  if (!next) return null;
  const saved = await saveConfig(accountId, next, 0);
  return saved.ok ? { config: next, version: saved.version } : null;
}
