import "server-only";

import { z } from "zod";

import { getJson } from "./cache";

// Place names to coordinates, for widgets centred on a place anywhere in the world (the earth wind map, 2026-11-21).
// Open-Meteo's geocoding API, from the same free service as the weather, with no key. It finds towns and cities, not
// street addresses; Settings › Commute uses TomTom for those.

const API = "https://geocoding-api.open-meteo.com/v1/search";

const answerSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        admin1: z.string().optional(),
        country: z.string().optional(),
      }),
    )
    .default([]),
});

export interface PlaceMatch {
  label: string;
  latitude: number;
  longitude: number;
}

/** "Langley, British Columbia, Canada", once each. */
export function trimPlaces(raw: unknown): PlaceMatch[] {
  const seen = new Set<string>();
  return answerSchema
    .parse(raw)
    .results.map((r) => ({
      label: [r.name, r.admin1, r.country]
        .filter((s): s is string => Boolean(s))
        .join(", ")
        .slice(0, 80),
      latitude: r.latitude,
      longitude: r.longitude,
    }))
    .filter((m) => {
      if (seen.has(m.label)) return false;
      seen.add(m.label);
      return true;
    })
    .slice(0, 6);
}

export async function findPlaces(name: string): Promise<PlaceMatch[]> {
  const q = new URLSearchParams({ name: name.trim(), count: "8", language: "en", format: "json" });
  return trimPlaces(await getJson(`${API}?${q}`));
}
