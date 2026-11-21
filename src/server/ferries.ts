import "server-only";

import { z } from "zod";

import type { DashboardConfig } from "@/lib/config/schema";
import type { FerriesData, FerryRouteData, FerrySailing } from "@/lib/display/types";
import { FERRY_ROUTES, ferryRouteName } from "@/lib/ferries";

import { cached, getJson } from "./cache";

// BC Ferries sailings (Melvin, 2026-11-21): the next sailings on the routes a ferries widget picks, and how full each
// one is. BC Ferries has no public API, so this reads the community BC Ferries API (bcferriesapi.ca, MIT, no key),
// which reads BC Ferries' current conditions pages every minute. Its /v2/capacity/ answer covers every route with
// "how full" in one request, so one cached copy (two minutes) serves every widget and display. When it can't be read,
// the last good copy is served, and the widget says the sailings may be out of date.

const URL = "https://www.bcferriesapi.ca/v2/capacity/";
const TTL = 2 * 60_000;
const ALL: string[] = [...FERRY_ROUTES];

const ampm = z.string().regex(/^(1[0-2]|0?[1-9]):[0-5]\d\s*(am|pm)$/i);

const sailingSchema = z.object({
  time: ampm,
  arrivalTime: z.string().default(""),
  sailingStatus: z.string().default(""),
  status: z.string().optional(),
  statusText: z.string().optional(),
  vesselStatus: z.string().default(""),
  fill: z.number().default(0),
  carFill: z.number().default(0),
  vesselName: z.string().default(""),
  delayMinutes: z.number().int().nonnegative().optional(),
  actualDepartureTime: z.string().optional(),
  capacityKnown: z.boolean().optional(),
  carCapacityKnown: z.boolean().optional(),
});

const answerSchema = z.object({
  routes: z.array(
    z.object({
      routeCode: z.string(),
      sailingDuration: z.string().default(""),
      dataStatus: z.string().optional(),
      // A sailing that doesn't parse is dropped rather than failing the whole route.
      sailings: z.array(z.unknown()).default([]),
    }),
  ),
});

/** "8:05 pm" → "20:05". */
export function to24h(t: string): string {
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i.exec(t.trim());
  if (!m) return "";
  const h = (Number(m[1]) % 12) + (m[3]!.toLowerCase() === "pm" ? 12 : 0);
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

const percent = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function trimSailing(raw: unknown): FerrySailing | null {
  const r = sailingSchema.safeParse(raw);
  if (!r.success) return null;
  const s = r.data;
  const status = (s.status ?? "").toLowerCase();
  const left = status === "departed" || status === "arrived" || s.sailingStatus === "past" || s.sailingStatus === "current";
  if (left || s.actualDepartureTime) return null;
  const cancelled = status === "cancelled" || s.sailingStatus === "cancelled";
  const delayed = !cancelled && (status === "delayed" || (s.delayMinutes ?? 0) > 0);
  // Older answers have no capacityKnown flags; a number above zero is then BC Ferries' own reading.
  const fillKnown = s.capacityKnown ?? s.fill > 0;
  const carKnown = s.carCapacityKnown ?? s.carFill > 0;
  return {
    time: to24h(s.time),
    arrive: ampm.safeParse(s.arrivalTime).success ? to24h(s.arrivalTime) : "",
    state: cancelled ? "cancelled" : delayed ? "delayed" : "scheduled",
    ...(fillKnown && !cancelled ? { fill: percent(s.fill) } : {}),
    ...(carKnown && !cancelled ? { carFill: percent(s.carFill) } : {}),
    vessel: s.vesselName.slice(0, 60),
    ...(s.delayMinutes ? { delayMinutes: s.delayMinutes } : {}),
    note: (s.statusText || s.vesselStatus).split(" | ")[0]!.slice(0, 120),
  };
}

/** The routes asked for, in that order, with sailings that haven't left yet. Unknown codes are left out. */
export function trimCapacity(raw: unknown, codes: string[], perRoute = 8): FerryRouteData[] {
  // The API answers with a bare JSON string ("BC Ferries Data Currently Down") when it has nothing.
  const answer = answerSchema.parse(raw);
  const byCode = new Map(answer.routes.map((r) => [r.routeCode, r]));
  return codes.flatMap((code) => {
    const r = byCode.get(code);
    if (!r) return [];
    const sailings = r.sailings
      .map(trimSailing)
      .filter((s): s is FerrySailing => s !== null)
      .slice(0, perRoute);
    return [
      {
        code,
        name: ferryRouteName(code),
        duration: r.sailingDuration.slice(0, 20),
        status: r.dataStatus === "no-service" ? ("no-service" as const) : ("" as const),
        sailings,
      },
    ];
  });
}

/** Every route any ferries widget shows, once each. */
export function ferryRoutesInUse(config: DashboardConfig): string[] {
  const codes = new Set<string>();
  for (const v of config.views) for (const w of v.widgets) if (w.type === "ferries") for (const c of w.routes) codes.add(c);
  return [...codes];
}

export async function ferriesFeed(config: DashboardConfig, now = Date.now()): Promise<FerriesData> {
  const codes = ferryRoutesInUse(config);
  if (codes.length === 0) return { updatedAt: now, at: now, down: false, routes: [] };
  try {
    // The whole answer is cached (trimmed to the sailings we use), so a widget picking another route needs no refetch.
    const all = await cached("ferries:capacity", TTL, async () => trimCapacity(await getJson(URL, {}, 10_000), ALL), now);
    const byCode = new Map(all.value.map((r) => [r.code, r]));
    return { updatedAt: now, at: all.fetchedAt, down: false, routes: codes.flatMap((c) => byCode.get(c) ?? []) };
  } catch {
    return { updatedAt: now, at: 0, down: true, routes: [] };
  }
}
