import "server-only";

import { z } from "zod";

import type { DashboardConfig } from "@/lib/config/schema";
import type { WeatherData, WeatherDay, WeatherHour } from "@/lib/display/types";
import { zonedFormatter } from "@/lib/timeZone";

import { getJson } from "./cache";

// Environment Canada city-page weather via MSC GeoMet (Melvin, 2026-11-23: homescreens-style provider choice).
// Official forecast for ~840 Canadian cities; no key. Mapped into the same WeatherData shape as Open-Meteo.

const enNum = z.union([z.number(), z.object({ en: z.number() }).transform((v) => v.en)]);
const icon = z.object({ value: z.union([z.number(), z.string()]).optional() }).passthrough();

const featureSchema = z.object({
  id: z.string().optional(),
  geometry: z
    .object({
      coordinates: z.tuple([z.number(), z.number()]).rest(z.number()).optional(),
    })
    .passthrough()
    .optional(),
  properties: z
    .object({
      identifier: z.string().optional(),
      name: z.object({ en: z.string().optional() }).passthrough().optional(),
      currentConditions: z
        .object({
          temperature: z.object({ value: enNum }).passthrough().optional(),
          relativeHumidity: z.object({ value: enNum }).passthrough().optional(),
          wind: z
            .object({
              speed: z.object({ value: enNum }).passthrough().optional(),
            })
            .passthrough()
            .optional(),
          iconCode: icon.optional(),
          windChill: z.object({ value: enNum }).passthrough().optional(),
          humidex: z.object({ value: enNum }).passthrough().optional(),
          timestamp: z.union([z.string(), z.object({ en: z.string() })]).optional(),
        })
        .passthrough()
        .optional(),
      riseSet: z
        .object({
          sunrise: z.object({ en: z.string() }).passthrough().optional(),
          sunset: z.object({ en: z.string() }).passthrough().optional(),
        })
        .passthrough()
        .optional(),
      hourlyForecastGroup: z
        .object({
          hourlyForecasts: z
            .array(
              z
                .object({
                  timestamp: z.string(),
                  temperature: z.object({ value: enNum }).passthrough().optional(),
                  iconCode: icon.optional(),
                  lop: z.object({ value: enNum }).passthrough().optional(),
                })
                .passthrough(),
            )
            .optional(),
        })
        .passthrough()
        .optional(),
      forecastGroup: z
        .object({
          forecasts: z
            .array(
              z
                .object({
                  period: z
                    .object({
                      textForecastName: z.object({ en: z.string().optional() }).passthrough().optional(),
                      value: z.object({ en: z.string().optional() }).passthrough().optional(),
                    })
                    .passthrough()
                    .optional(),
                  temperatures: z
                    .object({
                      temperature: z
                        .array(
                          z
                            .object({
                              class: z.object({ en: z.string().optional() }).passthrough().optional(),
                              value: enNum,
                            })
                            .passthrough(),
                        )
                        .optional(),
                    })
                    .passthrough()
                    .optional(),
                  abbreviatedForecast: z
                    .object({
                      icon: icon.optional(),
                      pop: z.union([z.string(), z.object({ en: z.string().optional() })]).optional(),
                    })
                    .passthrough()
                    .optional(),
                  cloudPrecip: z.union([z.string(), z.object({ en: z.string().optional() })]).optional(),
                })
                .passthrough(),
            )
            .optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough(),
});

const collectionSchema = z.object({
  features: z.array(featureSchema).optional(),
});

/** Map Environment Canada icon codes onto WMO-ish codes the wall SVGs already understand. */
export function ecIconToWmo(raw: number | string | undefined | null): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : raw;
  if (n == null || !Number.isFinite(n)) return 3;
  // Night icons are usually day + 30 (or + 30-ish for some sets).
  const day = n >= 30 ? n - 30 : n;
  if (day <= 1) return day === 0 ? 0 : 1;
  if (day === 2) return 2;
  if (day <= 10) return 3;
  if (day === 11 || day === 12) return 61;
  if (day === 13) return 63;
  if (day === 14 || day === 15) return 66;
  if (day >= 16 && day <= 18) return 71;
  if (day === 19) return 95;
  if (day >= 20 && day <= 22) return 45;
  if (day >= 23 && day <= 25) return 61;
  if (day >= 26 && day <= 28) return 71;
  if (day === 29) return 95;
  return 3;
}

function iconValue(i: { value?: number | string } | undefined): number {
  return ecIconToWmo(i?.value);
}

function CtoF(c: number): number {
  return (c * 9) / 5 + 32;
}

function kmhToMph(k: number): number {
  return k * 0.621371;
}

function localIso(utcIso: string, timeZone: string, withSeconds = false): string {
  const d = new Date(utcIso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = zonedFormatter(timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" as const } : {}),
    hourCycle: "h23",
  }).formatToParts(d);
  const n = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const base = `${n("year")}-${n("month")}-${n("day")}T${n("hour")}:${n("minute")}`;
  return withSeconds ? `${base}:${n("second")}` : base;
}

function localDate(utcIso: string, timeZone: string): string {
  return localIso(utcIso, timeZone).slice(0, 10);
}

function isDayAt(now: number, sunriseUtc: string | undefined, sunsetUtc: string | undefined): boolean {
  if (!sunriseUtc || !sunsetUtc) return true;
  const rise = Date.parse(sunriseUtc);
  const set = Date.parse(sunsetUtc);
  if (!Number.isFinite(rise) || !Number.isFinite(set)) return true;
  return now >= rise && now < set;
}

function popFromText(raw: unknown): number {
  const text =
    typeof raw === "string"
      ? raw
      : raw && typeof raw === "object" && "en" in raw && typeof (raw as { en?: unknown }).en === "string"
        ? (raw as { en: string }).en
        : "";
  const m = /(\d+)\s*(?:%|percent)/i.exec(text);
  if (m) return Number(m[1]);
  const popOnly = /^\d+$/.exec(text.trim());
  return popOnly ? Number(popOnly[0]) : 0;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function canadaCitiesUrl(lat: number, lon: number): string {
  const pad = 0.8;
  const bbox = [lon - pad, lat - pad, lon + pad, lat + pad].map((n) => n.toFixed(4)).join(",");
  return `https://api.weather.gc.ca/collections/citypageweather-realtime/items?f=json&limit=25&bbox=${bbox}`;
}

export function canadaCityUrl(id: string): string {
  return `https://api.weather.gc.ca/collections/citypageweather-realtime/items/${encodeURIComponent(id)}?f=json&lang=en`;
}

/** Pick the nearest GeoMet city-page feature within maxKm, or null. */
export function nearestCanadaCity(raw: unknown, lat: number, lon: number, maxKm = 120): { id: string; name: string; km: number } | null {
  const parsed = collectionSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.features?.length) return null;
  let best: { id: string; name: string; km: number } | null = null;
  for (const f of parsed.data.features) {
    const id = f.properties.identifier ?? f.id;
    const coords = f.geometry?.coordinates;
    if (!id || !coords) continue;
    const [cLon, cLat] = coords;
    const km = haversineKm(lat, lon, cLat, cLon);
    if (km > maxKm) continue;
    if (!best || km < best.km) {
      best = { id, name: f.properties.name?.en ?? id, km };
    }
  }
  return best;
}

function addCalendarDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, (d ?? 1) + n));
  return dt.toISOString().slice(0, 10);
}

function canadaProperties(raw: unknown) {
  if (raw && typeof raw === "object" && (raw as { type?: string }).type === "Feature") {
    return featureSchema.parse(raw).properties;
  }
  const first = collectionSchema.parse(raw).features?.[0];
  if (!first) throw new Error("Environment Canada city page had no features");
  return first.properties;
}

export function trimCanada(raw: unknown, units: DashboardConfig["units"], timeZone: string, now: number): WeatherData {
  const props = canadaProperties(raw);
  const cc = props.currentConditions ?? {};
  const tempC = Number(cc.temperature?.value ?? 0);
  const feelsC = Number(cc.humidex?.value ?? cc.windChill?.value ?? tempC);
  const windKmh = Number(cc.wind?.speed?.value ?? 0);
  const humidity = Math.round(Number(cc.relativeHumidity?.value ?? 0));
  const code = iconValue(cc.iconCode);
  const sunriseUtc = props.riseSet?.sunrise?.en;
  const sunsetUtc = props.riseSet?.sunset?.en;
  const imperial = units === "imperial";
  const round = (n: number) => Math.round(n);
  const temp = (c: number) => round(imperial ? CtoF(c) : c);
  const wind = (k: number) => round(imperial ? kmhToMph(k) : k);

  const hours: WeatherHour[] = (props.hourlyForecastGroup?.hourlyForecasts ?? []).slice(0, 24).map((h) => {
    const t = Number(h.temperature?.value ?? 0);
    const ts = h.timestamp;
    const local = localIso(ts, timeZone);
    const hourCode = iconValue(h.iconCode);
    const rise = sunriseUtc ? Date.parse(sunriseUtc) : NaN;
    const set = sunsetUtc ? Date.parse(sunsetUtc) : NaN;
    const at = Date.parse(ts);
    const day = Number.isFinite(rise) && Number.isFinite(set) && Number.isFinite(at) ? at >= rise && at < set : true;
    return {
      time: local,
      temp: temp(t),
      code: hourCode,
      precip: Math.round(Number(h.lop?.value ?? 0)),
      isDay: day,
    };
  });

  const today = localDate(new Date(now).toISOString(), timeZone);
  // Daytime + overnight periods → one row per calendar day (high from day, low from night).
  const days: WeatherDay[] = [];
  let pending: WeatherDay | null = null;
  let dayIndex = 0;
  for (const f of props.forecastGroup?.forecasts ?? []) {
    const name = f.period?.textForecastName?.en ?? f.period?.value?.en ?? "";
    const night = /night|soir|nuit/i.test(name);
    const temps = f.temperatures?.temperature ?? [];
    const high = temps.find((t) => t.class?.en === "high");
    const low = temps.find((t) => t.class?.en === "low");
    const pop = popFromText(f.abbreviatedForecast?.pop ?? f.cloudPrecip);
    const fCode = iconValue(f.abbreviatedForecast?.icon);
    if (!night) {
      if (pending) days.push(pending);
      pending = {
        date: addCalendarDays(today, dayIndex++),
        code: fCode,
        max: temp(Number(high?.value ?? low?.value ?? tempC)),
        min: temp(Number(low?.value ?? high?.value ?? tempC)),
        precip: pop,
      };
    } else if (pending) {
      if (low) pending.min = temp(Number(low.value));
      if (pop > pending.precip) pending.precip = pop;
    } else {
      pending = {
        date: addCalendarDays(today, dayIndex++),
        code: fCode,
        max: temp(Number(high?.value ?? tempC)),
        min: temp(Number(low?.value ?? tempC)),
        precip: pop,
      };
    }
  }
  if (pending) days.push(pending);

  return {
    updatedAt: now,
    units: imperial ? { temp: "°F", wind: "mph" } : { temp: "°C", wind: "km/h" },
    current: {
      temp: temp(tempC),
      feels: temp(feelsC),
      code,
      isDay: isDayAt(now, sunriseUtc, sunsetUtc),
      wind: wind(windKmh),
      humidity,
    },
    today: {
      sunrise: sunriseUtc ? localIso(sunriseUtc, timeZone, true) : "",
      sunset: sunsetUtc ? localIso(sunsetUtc, timeZone, true) : "",
    },
    hours,
    days: days.slice(0, 8),
  };
}

export async function fetchCanadaCityId(lat: number, lon: number): Promise<string> {
  const list = await getJson(canadaCitiesUrl(lat, lon));
  const nearest = nearestCanadaCity(list, lat, lon);
  if (!nearest) throw new Error("No Environment Canada city page near this location");
  return nearest.id;
}
