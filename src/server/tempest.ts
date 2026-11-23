import "server-only";

import type { DashboardConfig } from "@/lib/config/schema";
import type { TempestData } from "@/lib/display/types";

import { cached, type Cached } from "./cache";
import { getSecret } from "./secrets";

// WeatherFlow Tempest / AIR (Phase 4, Household). Station id in Settings; token in secrets (docs/tempest.md).

const TTL = 60_000;
const BASE = "https://swd.weatherflow.com/swd/rest";

interface ObsStation {
  station_id?: number;
  obs?: {
    air_temperature?: number;
    relative_humidity?: number;
    wind_avg?: number;
    wind_gust?: number;
    wind_lull?: number;
    precip_accum_local_day?: number;
    barometric_pressure?: number;
    timestamp?: number;
  }[];
}

export function trimTempest(raw: unknown, units: DashboardConfig["units"], now: number): TempestData | null {
  const body = raw as ObsStation;
  const row = body.obs?.[0];
  if (!row) return null;
  const metric = units === "metric";
  const temp = row.air_temperature;
  const wind = row.wind_avg;
  const gust = row.wind_gust;
  const rain = row.precip_accum_local_day;
  return {
    updatedAt: now,
    temp: temp !== undefined ? Math.round((metric ? temp : (temp * 9) / 5 + 32) * 10) / 10 : undefined,
    humidity: row.relative_humidity !== undefined ? Math.round(row.relative_humidity) : undefined,
    wind: wind !== undefined ? Math.round(metric ? wind : wind * 2.237) : undefined,
    gust: gust !== undefined ? Math.round(metric ? gust : gust * 2.237) : undefined,
    rain: rain !== undefined ? Math.round(rain * 10) / 10 : undefined,
    pressure: row.barometric_pressure !== undefined ? Math.round(row.barometric_pressure) : undefined,
    units: metric ? { temp: "°C", wind: "km/h", rain: "mm" } : { temp: "°F", wind: "mph", rain: "in" },
    stale: false,
  };
}

export async function tempestFeed(accountId: string, config: DashboardConfig, now = Date.now()): Promise<Cached<TempestData>> {
  const stationId = config.integrations.smartHome.tempest.stationId;
  const token = await getSecret(accountId, "tempest.token");
  const empty: TempestData = {
    updatedAt: now,
    units: config.units === "metric" ? { temp: "°C", wind: "km/h", rain: "mm" } : { temp: "°F", wind: "mph", rain: "in" },
    stale: false,
  };
  if (!stationId || !token) return { value: empty, fetchedAt: now, stale: false };
  const key = `tempest:${accountId}:${stationId}`;
  return cached(
    key,
    TTL,
    async () => {
      const url = `${BASE}/observations/station/${stationId}?token=${encodeURIComponent(token)}`;
      const r = await fetch(url, { headers: { "User-Agent": "Everydaypane/1.0" }, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) throw new Error(`Tempest answered ${r.status}`);
      const trimmed = trimTempest(await r.json(), config.units, now);
      return trimmed ?? empty;
    },
    now,
  );
}
