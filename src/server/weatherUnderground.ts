import "server-only";

import type { DashboardConfig } from "@/lib/config/schema";
import type { WeatherUndergroundData } from "@/lib/display/types";

import { cached, type Cached } from "./cache";
import { env } from "./env";
import { getSecret } from "./secrets";

// Weather Underground personal weather station API (Phase 4, Household, docs/weather-underground.md).

const TTL = 5 * 60_000;

interface WUObs {
  observations?: {
    metric?: {
      temp?: number;
      humidity?: number;
      windSpeed?: number;
      windGust?: number;
      precipRate?: number;
      precipTotal?: number;
    };
    imperial?: {
      temp?: number;
      humidity?: number;
      windSpeed?: number;
      windGust?: number;
      precipRate?: number;
      precipTotal?: number;
    };
    obsTimeLocal?: string;
  }[];
}

export function trimWeatherUnderground(raw: unknown, units: DashboardConfig["units"], now: number): WeatherUndergroundData | null {
  const body = raw as WUObs;
  const row = body.observations?.[0];
  if (!row) return null;
  const u = units === "metric" ? row.metric : row.imperial;
  if (!u) return null;
  const metric = units === "metric";
  return {
    updatedAt: now,
    temp: u.temp !== undefined ? Math.round(u.temp * 10) / 10 : undefined,
    humidity: u.humidity !== undefined ? Math.round(u.humidity) : undefined,
    wind: u.windSpeed !== undefined ? Math.round(u.windSpeed) : undefined,
    gust: u.windGust !== undefined ? Math.round(u.windGust) : undefined,
    rainRate: u.precipRate !== undefined ? Math.round(u.precipRate * 10) / 10 : undefined,
    rainToday: u.precipTotal !== undefined ? Math.round(u.precipTotal * 10) / 10 : undefined,
    units: metric ? { temp: "°C", wind: "km/h", rain: "mm" } : { temp: "°F", wind: "mph", rain: "in" },
    observedAt: row.obsTimeLocal ?? "",
    stale: false,
  };
}

async function wuKey(accountId: string): Promise<string | null> {
  const perAccount = await getSecret(accountId, "wu.apiKey");
  return perAccount || env.wuApiKey() || null;
}

export async function weatherUndergroundFeed(
  accountId: string,
  config: DashboardConfig,
  now = Date.now(),
): Promise<Cached<WeatherUndergroundData>> {
  const stationId = config.integrations.smartHome.weatherUnderground.stationId.trim();
  const apiKey = await wuKey(accountId);
  const empty: WeatherUndergroundData = {
    updatedAt: now,
    units: config.units === "metric" ? { temp: "°C", wind: "km/h", rain: "mm" } : { temp: "°F", wind: "mph", rain: "in" },
    stale: false,
  };
  if (!stationId || !apiKey) return { value: empty, fetchedAt: now, stale: false };

  const key = `wu:${accountId}:${stationId}`;
  return cached(
    key,
    TTL,
    async () => {
      const q = new URLSearchParams({ stationId, format: "json", units: config.units === "metric" ? "m" : "e", apiKey });
      const r = await fetch(`https://api.weather.com/v2/pws/observations/current?${q}`, {
        headers: { "User-Agent": "Everydaypane/1.0" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!r.ok) throw new Error(`Weather Underground answered ${r.status}`);
      const trimmed = trimWeatherUnderground(await r.json(), config.units, now);
      return trimmed ?? empty;
    },
    now,
  );
}
