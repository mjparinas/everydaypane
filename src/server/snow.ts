import "server-only";

import { z } from "zod";

import type { DashboardConfig } from "@/lib/config/schema";
import type { SnowData, SnowMountain } from "@/lib/display/types";
import { DEFAULT_MOUNTAINS, mountainById, type Mountain } from "@/lib/snow";

import { cached } from "./cache";

// Mountain snow report (Melvin, 2026-11-25): Open-Meteo's free forecast API (no key) at each mountain's coordinates and
// a mid-mountain elevation. One request covers every mountain on the household's snow widgets (Open-Meteo takes
// comma-separated locations and answers an array). The numbers are the weather model's, not the resort's own report:
// resorts publish theirs only as web pages, and the widget says "Model estimate" so nobody mistakes it for one.

const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
const TTL = 30 * 60_000;
const HOUR = 3_600;

const num = z.number().nullable();
const locationSchema = z.object({
  utc_offset_seconds: z.number().default(0),
  current: z.object({ temperature_2m: num.optional() }).optional(),
  hourly: z.object({ time: z.array(z.number()), snowfall: z.array(num), snow_depth: z.array(num) }),
  daily: z.object({ time: z.array(z.number()), snowfall_sum: z.array(num) }),
});
type Location = z.infer<typeof locationSchema>;

/** The mountains on any snow widget, in the order they first appear. */
export function mountainsInUse(config: DashboardConfig): Mountain[] {
  const ids = new Set<string>();
  for (const view of config.views)
    for (const w of view.widgets) if (w.type === "snow") for (const id of w.mountains.length ? w.mountains : DEFAULT_MOUNTAINS) ids.add(id);
  return [...ids].map(mountainById).filter((m): m is Mountain => Boolean(m));
}

export function snowUrl(mountains: Mountain[], timeZone: string): string {
  const q = new URLSearchParams({
    latitude: mountains.map((m) => m.latitude).join(","),
    longitude: mountains.map((m) => m.longitude).join(","),
    elevation: mountains.map((m) => m.elevation).join(","),
    current: "temperature_2m",
    hourly: "snowfall,snow_depth",
    daily: "snowfall_sum",
    past_days: "1",
    forecast_days: "3",
    timezone: timeZone,
    timeformat: "unixtime",
  });
  return `${OPEN_METEO}?${q}`;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** One location of Open-Meteo's answer as the wall's row: snowfall in the last 24 hours, depth now, three local days. */
export function parseLocation(mountain: Mountain, loc: Location, nowMs: number): SnowMountain {
  const now = nowMs / 1000;
  const { time, snowfall, snow_depth } = loc.hourly;
  let newSnow: number | undefined;
  let depth: number | undefined;
  for (let i = 0; i < time.length; i++) {
    const t = time[i]!;
    if (t > now) break;
    const fall = snowfall[i];
    // Open-Meteo stamps an hour's snowfall at the end of that hour, so the last 24 hours end at the latest past stamp.
    if (t > now - 24 * HOUR && typeof fall === "number") newSnow = (newSnow ?? 0) + fall;
    const d = snow_depth[i];
    if (typeof d === "number") depth = d * 100; // metres → centimetres
  }
  const forecast: SnowMountain["forecast"] = [];
  loc.daily.time.forEach((t, i) => {
    // Each daily stamp is local midnight; keep today and later.
    if (t + 24 * HOUR <= now || forecast.length >= 3) return;
    const day = new Date((t + loc.utc_offset_seconds) * 1000).toISOString().slice(0, 10);
    forecast.push({ day, snow: round1(loc.daily.snowfall_sum[i] ?? 0) });
  });
  const temperature = loc.current?.temperature_2m;
  return {
    id: mountain.id,
    name: mountain.name,
    ...(newSnow === undefined ? {} : { newSnow: round1(newSnow) }),
    ...(depth === undefined ? {} : { depth: Math.round(Math.max(0, depth)) }),
    ...(typeof temperature === "number" ? { temperature } : {}),
    forecast,
  };
}

/** Open-Meteo answers one object for one location and an array for several. */
export function parseSnow(mountains: Mountain[], body: unknown, nowMs: number): SnowMountain[] {
  const list = Array.isArray(body) ? body : [body];
  return mountains.map((m, i) => {
    const loc = locationSchema.safeParse(list[i]);
    return loc.success ? parseLocation(m, loc.data, nowMs) : { id: m.id, name: m.name, forecast: [] };
  });
}

export async function snowFeed(config: DashboardConfig, now = Date.now()): Promise<SnowData & { stale: boolean }> {
  const mountains = mountainsInUse(config);
  const unit = config.units === "imperial" ? "in" : "cm";
  if (!mountains.length) return { updatedAt: now, unit, mountains: [], stale: false };
  const timeZone = config.location.timeZone;
  // Public data with no account in it, so households that pick the same mountains share one read.
  const key = `snow:${timeZone}:${mountains.map((m) => m.id).join(",")}`;
  try {
    const data = await cached(
      key,
      TTL,
      async () => {
        const r = await fetch(snowUrl(mountains, timeZone), { signal: AbortSignal.timeout(12_000) });
        if (!r.ok) throw new Error(`Open-Meteo answered ${r.status}`);
        return parseSnow(mountains, await r.json(), now);
      },
      now,
    );
    const toF = (c: number) => (c * 9) / 5 + 32;
    const rows = data.value.map((m) =>
      m.temperature === undefined ? m : { ...m, temperature: Math.round(unit === "in" ? toF(m.temperature) : m.temperature) },
    );
    return { updatedAt: data.fetchedAt, unit, mountains: rows, stale: data.stale };
  } catch (error) {
    console.error("[snow]", error);
    return { updatedAt: now, unit, mountains: [], error: "Snow report unavailable", stale: true };
  }
}
