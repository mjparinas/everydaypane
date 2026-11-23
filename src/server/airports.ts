import "server-only";

import { z } from "zod";

import type { DashboardConfig } from "@/lib/config/schema";
import type { AirportRow, AirportsData } from "@/lib/display/types";

import { cached, getJson } from "./cache";
import { env } from "./env";

// Airport METAR (Phase 5): Aviation Weather when no AIRPORT_API_KEY; Aviationstack delays when a key is set.

const TTL = 5 * 60_000;

const metarSchema = z.array(
  z.object({
    icaoId: z.string().optional(),
    rawOb: z.string().optional(),
    temp: z.number().optional(),
    wspd: z.number().optional(),
    fltCat: z.string().optional(),
  }),
);

const stackSchema = z.object({
  data: z
    .array(
      z.object({
        flight: z
          .object({
            iata: z.string().optional(),
            number: z.string().optional(),
            status: z.string().optional(),
          })
          .optional(),
        departure: z
          .object({
            delay: z.number().optional(),
            airport: z.string().optional(),
            scheduled: z.string().optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

function codesOf(config: DashboardConfig): string[] {
  const set = new Set<string>();
  for (const view of config.views) {
    for (const w of view.widgets) {
      if (w.type === "airports") for (const c of w.codes) set.add(c.toUpperCase().slice(0, 4));
    }
  }
  return [...set].slice(0, 12);
}

async function metar(icao: string): Promise<AirportRow> {
  const raw = await getJson(`https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(icao)}&format=json`);
  const row = metarSchema.safeParse(raw).data?.[0];
  return {
    code: icao,
    summary: row?.rawOb?.slice(0, 120) ?? `${icao}: no METAR`,
    temp: row?.temp,
    wind: row?.wspd,
    category: row?.fltCat ?? "",
    delays: [],
  };
}

async function delays(icao: string): Promise<string[]> {
  const key = env.airportApiKey();
  if (!key) return [];
  const raw = await getJson(
    `http://api.aviationstack.com/v1/flights?access_key=${encodeURIComponent(key)}&dep_iata=${encodeURIComponent(icao)}&limit=5`,
  );
  const p = stackSchema.safeParse(raw);
  if (!p.success) return [];
  return (p.data.data ?? [])
    .filter((f) => (f.departure?.delay ?? 0) > 0)
    .map((f) => `${f.flight?.iata ?? f.flight?.number ?? "Flight"} delayed ${f.departure!.delay} min`)
    .slice(0, 5);
}

export async function airportsFeed(config: DashboardConfig): Promise<AirportsData> {
  const codes = codesOf(config);
  const key = `airports:${codes.join(",")}`;
  const { value, fetchedAt, stale } = await cached(key, TTL, async () => {
    const airports: AirportRow[] = [];
    for (const code of codes) {
      const row = await metar(code);
      row.delays = await delays(code).catch(() => []);
      airports.push(row);
    }
    return airports;
  });
  return { updatedAt: fetchedAt, stale, airports: value as AirportRow[] };
}
