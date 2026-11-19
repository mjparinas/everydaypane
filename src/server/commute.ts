import "server-only";

import { z } from "zod";

import type { DashboardConfig } from "@/lib/config/schema";
import type { CommuteData, CommuteRoute } from "@/lib/display/types";

import { cached, getJson } from "./cache";
import { env } from "./env";

// Commute time (Melvin, 2026-11-19): drive times from home with live traffic, through TomTom's Routing API. TomTom
// because its free tier (2,500 requests a day, no credit card) covers every route refreshed every five minutes, and
// its traffic covers the Lower Mainland; Google's Routes API needs a billing account and charges for traffic-aware
// routes past 5,000 a month. Places are geocoded once, in the admin panel, with TomTom's Search API on the same key.
//
// TomTom takes its key only in the query string, so URLs here are never logged or put in an error message.

const API = "https://api.tomtom.com";
const TTL = 5 * 60_000;

// ---- Address → place ----

const geocodeSchema = z.object({
  results: z
    .array(z.object({ address: z.object({ freeformAddress: z.string() }), position: z.object({ lat: z.number(), lon: z.number() }) }))
    .default([]),
});

export interface PlaceMatch {
  label: string;
  latitude: number;
  longitude: number;
}

export function trimGeocode(raw: unknown): PlaceMatch[] {
  const seen = new Set<string>();
  return geocodeSchema
    .parse(raw)
    .results.map((r) => ({ label: r.address.freeformAddress.slice(0, 120), latitude: r.position.lat, longitude: r.position.lon }))
    .filter((m) => {
      if (!m.label || seen.has(m.label)) return false;
      seen.add(m.label);
      return true;
    })
    .slice(0, 6);
}

/** Addresses matching what the admin typed, nearest the dashboard's location first. */
export async function findPlace(term: string, near: { latitude: number; longitude: number }): Promise<PlaceMatch[]> {
  const q = new URLSearchParams({
    key: env.tomtomKey(),
    limit: "6",
    countrySet: "CA,US",
    lat: String(near.latitude),
    lon: String(near.longitude),
  });
  return trimGeocode(await getJson(`${API}/search/2/geocode/${encodeURIComponent(term.trim())}.json?${q}`));
}

// ---- Drive times ----

const routeSchema = z.object({
  routes: z
    .array(
      z.object({
        summary: z.object({
          lengthInMeters: z.number(),
          travelTimeInSeconds: z.number(),
          trafficDelayInSeconds: z.number().default(0),
          noTrafficTravelTimeInSeconds: z.number().optional(),
        }),
      }),
    )
    .min(1),
});

export interface Drive {
  seconds: number;
  freeFlowSeconds: number;
  delaySeconds: number;
  meters: number;
}

export function trimRoute(raw: unknown): Drive {
  const s = routeSchema.parse(raw).routes[0]!.summary;
  const delay = Math.max(0, Math.round(s.trafficDelayInSeconds));
  return {
    seconds: Math.round(s.travelTimeInSeconds),
    freeFlowSeconds: Math.round(s.noTrafficTravelTimeInSeconds ?? s.travelTimeInSeconds - delay),
    delaySeconds: delay,
    meters: Math.round(s.lengthInMeters),
  };
}

type Point = { latitude: number; longitude: number };
const ll = (p: Point) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`;

function drive(from: Point, to: Point, now: number) {
  return cached(
    `commute:${ll(from)}:${ll(to)}`,
    TTL,
    async () => {
      const q = new URLSearchParams({
        key: env.tomtomKey(),
        traffic: "true",
        travelMode: "car",
        routeType: "fastest",
        computeTravelTimeFor: "all",
        routeRepresentation: "summaryOnly",
      });
      return trimRoute(await getJson(`${API}/routing/1/calculateRoute/${ll(from)}:${ll(to)}/json?${q}`));
    },
    now,
  );
}

/** Every destination's drive from home. One route failing leaves it without a time; the others still show. */
export async function commuteFeed(config: DashboardConfig, now = Date.now()): Promise<CommuteData> {
  const { home, destinations } = config.integrations.commute;
  if (!env.tomtomKey()) return { updatedAt: now, missing: "key", routes: [] };
  if (!home || destinations.length === 0) return { updatedAt: now, missing: "places", routes: [] };
  const drives = await Promise.allSettled(destinations.map((d) => drive(home, d, now)));
  const routes = destinations.map((d, i): CommuteRoute => {
    const base = { id: d.id, name: d.name, emoji: d.emoji, arriveBy: d.arriveBy };
    const r = drives[i];
    return r?.status === "fulfilled" ? { ...base, ...r.value.value, at: r.value.fetchedAt } : base;
  });
  return { updatedAt: now, missing: "", routes };
}
