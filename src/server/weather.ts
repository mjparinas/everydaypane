import "server-only";

import { z } from "zod";

import type { DashboardConfig } from "@/lib/config/schema";
import type { AirData, WeatherData } from "@/lib/display/types";

import { cached, getJson, type Cached } from "./cache";

// Weather and air quality from Open-Meteo (free, no key, Environment Canada's GEM model among its sources). The
// server fetches, trims and caches; a display gets a few hundred bytes.

const forecastSchema = z.object({
  current: z.object({
    temperature_2m: z.number(),
    apparent_temperature: z.number(),
    weather_code: z.number(),
    is_day: z.number(),
    wind_speed_10m: z.number(),
    relative_humidity_2m: z.number(),
    uv_index: z.number().nullable().optional(),
  }),
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(z.number()),
    weather_code: z.array(z.number()),
    precipitation_probability: z.array(z.number().nullable()),
    is_day: z.array(z.number()),
  }),
  daily: z.object({
    time: z.array(z.string()),
    weather_code: z.array(z.number()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
    precipitation_probability_max: z.array(z.number().nullable()),
    sunrise: z.array(z.string()),
    sunset: z.array(z.string()),
    uv_index_max: z.array(z.number().nullable()).optional(),
  }),
});

export function forecastUrl(config: Pick<DashboardConfig, "location" | "units">): string {
  const { latitude, longitude, timeZone } = config.location;
  const p = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    timezone: timeZone,
    current: "temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m,uv_index",
    hourly: "temperature_2m,weather_code,precipitation_probability,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max",
    forecast_days: "8",
    forecast_hours: "24",
  });
  if (config.units === "imperial") {
    p.set("temperature_unit", "fahrenheit");
    p.set("wind_speed_unit", "mph");
  }
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

export function trimForecast(raw: unknown, units: DashboardConfig["units"], now: number): WeatherData {
  const f = forecastSchema.parse(raw);
  const round = (n: number) => Math.round(n);
  const uv = f.current.uv_index;
  const uvMax = f.daily.uv_index_max?.[0];
  return {
    updatedAt: now,
    units: units === "imperial" ? { temp: "°F", wind: "mph" } : { temp: "°C", wind: "km/h" },
    current: {
      temp: round(f.current.temperature_2m),
      feels: round(f.current.apparent_temperature),
      code: f.current.weather_code,
      isDay: f.current.is_day === 1,
      wind: round(f.current.wind_speed_10m),
      humidity: round(f.current.relative_humidity_2m),
      ...(typeof uv === "number" && Number.isFinite(uv) ? { uv: round(uv) } : {}),
    },
    today: {
      sunrise: f.daily.sunrise[0] ?? "",
      sunset: f.daily.sunset[0] ?? "",
      ...(typeof uvMax === "number" && Number.isFinite(uvMax) ? { uvMax: round(uvMax) } : {}),
    },
    hours: f.hourly.time.slice(0, 24).map((time, i) => ({
      time,
      temp: round(f.hourly.temperature_2m[i] ?? 0),
      code: f.hourly.weather_code[i] ?? 0,
      precip: f.hourly.precipitation_probability[i] ?? 0,
      isDay: f.hourly.is_day[i] === 1,
    })),
    days: f.daily.time.map((date, i) => ({
      date,
      code: f.daily.weather_code[i] ?? 0,
      max: round(f.daily.temperature_2m_max[i] ?? 0),
      min: round(f.daily.temperature_2m_min[i] ?? 0),
      precip: f.daily.precipitation_probability_max[i] ?? 0,
    })),
  };
}

// Pollen is on the air-quality API, not the forecast (CAMS, grains/m³, often missing outside Europe). The wall shows
// the highest of these kinds (Melvin, 2026-11-22).
const POLLEN = ["alder_pollen", "birch_pollen", "grass_pollen", "mugwort_pollen", "olive_pollen", "ragweed_pollen"] as const;

const pollenLevel = z.number().nullable().optional();
const pollenSchema = z.object({
  current: z
    .object({
      alder_pollen: pollenLevel,
      birch_pollen: pollenLevel,
      grass_pollen: pollenLevel,
      mugwort_pollen: pollenLevel,
      olive_pollen: pollenLevel,
      ragweed_pollen: pollenLevel,
    })
    .optional(),
});

export function pollenUrl(config: Pick<DashboardConfig, "location">): string {
  const { latitude, longitude, timeZone } = config.location;
  const p = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    timezone: timeZone,
    current: POLLEN.join(","),
    forecast_days: "1",
  });
  return `https://air-quality-api.open-meteo.com/v1/air-quality?${p}`;
}

/** Highest pollen grains/m³ among the kinds Open-Meteo sent, or nothing when every kind is missing. */
export function maxPollen(raw: unknown): number | undefined {
  const parsed = pollenSchema.safeParse(raw);
  const current = parsed.success ? parsed.data.current : undefined;
  if (!current) return undefined;
  const values = POLLEN.flatMap((key) => {
    const n = current[key];
    return typeof n === "number" && Number.isFinite(n) ? [n] : [];
  });
  return values.length ? Math.round(Math.max(...values)) : undefined;
}

export function weather(config: DashboardConfig): Promise<Cached<WeatherData>> {
  const url = forecastUrl(config);
  const pollen = pollenUrl(config);
  return cached(`weather:${url}`, 15 * 60_000, async () => {
    const data = trimForecast(await getJson(url), config.units, Date.now());
    try {
      const level = maxPollen(await getJson(pollen));
      if (level !== undefined) data.pollen = level;
    } catch {
      // Pollen is extra, and often absent in North America. A failure still leaves the forecast.
    }
    return data;
  });
}

const airSchema = z.object({
  current: z.object({ us_aqi: z.number().nullable(), pm2_5: z.number().nullable() }),
  hourly: z.object({
    time: z.array(z.string()),
    pm2_5: z.array(z.number().nullable()),
    ozone: z.array(z.number().nullable()),
    nitrogen_dioxide: z.array(z.number().nullable()),
  }),
});

/**
 * Canada's Air Quality Health Index from 3-hour averages of NO₂ and O₃ (ppb) and PM2.5 (µg/m³), Health Canada's
 * formula (Stieb et al., 2008). Open-Meteo gives gases in µg/m³; at 25 °C 1 ppb NO₂ is 1.88 µg/m³ and O₃ 1.96 µg/m³.
 */
export function aqhi(no2ugm3: number, o3ugm3: number, pm25: number): number {
  const no2 = no2ugm3 / 1.88;
  const o3 = o3ugm3 / 1.96;
  const value = (1000 / 10.4) * (Math.exp(0.000871 * no2) - 1 + (Math.exp(0.000537 * o3) - 1) + (Math.exp(0.000487 * pm25) - 1));
  return Math.max(1, Math.round(value));
}

export function trimAir(raw: unknown, now: number, nowLocalHour: string): AirData {
  const a = airSchema.parse(raw);
  // The three hours up to and including now.
  const end = Math.max(
    0,
    a.hourly.time.findIndex((t) => t > nowLocalHour),
  );
  const from = Math.max(0, (end || a.hourly.time.length) - 3);
  const to = end || a.hourly.time.length;
  const avg = (xs: (number | null)[]) => {
    const vals = xs.slice(from, to).filter((x): x is number => x !== null);
    return vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : 0;
  };
  return {
    updatedAt: now,
    aqhi: aqhi(avg(a.hourly.nitrogen_dioxide), avg(a.hourly.ozone), avg(a.hourly.pm2_5)),
    usAqi: Math.round(a.current.us_aqi ?? 0),
    pm25: Math.round((a.current.pm2_5 ?? 0) * 10) / 10,
  };
}

export function air(config: DashboardConfig): Promise<Cached<AirData>> {
  const { latitude, longitude, timeZone } = config.location;
  const p = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    timezone: timeZone,
    current: "us_aqi,pm2_5",
    hourly: "pm2_5,ozone,nitrogen_dioxide",
    past_days: "1",
    forecast_days: "1",
  });
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?${p}`;
  return cached(`air:${url}`, 30 * 60_000, async () => {
    const hour = new Intl.DateTimeFormat("sv-SE", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .format(new Date())
      .replace(" ", "T");
    return trimAir(await getJson(url), Date.now(), `${hour}:00`);
  });
}
