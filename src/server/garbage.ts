import "server-only";

import { z } from "zod";

import type { DashboardConfig } from "@/lib/config/schema";
import type { BinKind, GarbageData } from "@/lib/display/types";

import { cached, type Cached } from "./cache";

// Garbage pickup (Melvin, 2026-11-17): the Township of Langley's collection calendar on tol.ca is Recycle Coach
// (project 521, district LANGL). A home's zone is looked up from its address once, in the admin panel; the server then
// fetches the zone's schedule twice a day and gives displays the next pickups. Recycle Coach runs the same API in a
// US and a Canadian region and doesn't say which a project uses, so each call tries both (as the open-source Home
// Assistant integration does).

const HOSTS = ["https://ca-web.apigw.recyclecoach.com", "https://us-web.apigw.recyclecoach.com"];
const TTL = 12 * 3_600_000;

async function getFirst(path: string, params: Record<string, string>): Promise<unknown> {
  const q = new URLSearchParams(params).toString();
  let last: unknown = null;
  for (const host of HOSTS) {
    try {
      const r = await fetch(`${host}${path}?${q}`, { headers: { "User-Agent": "Everydaypane/1.0" }, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) throw new Error(`Recycle Coach answered ${r.status}`);
      const body = (await r.json()) as unknown;
      // A region that doesn't serve the project answers 200 with an empty or error body.
      if (body && typeof body === "object" && !("error" in body && (body as { error: unknown }).error)) return body;
      last = new Error("Recycle Coach had no answer for this project");
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error("Recycle Coach is unavailable");
}

// ---- Address → zone ----

const lookupSchema = z.object({
  results: z.array(z.object({ address: z.string(), zones: z.record(z.string(), z.union([z.string(), z.number()])) })).default([]),
});

export interface ZoneMatch {
  address: string;
  zoneId: string;
}

/** A zone id as Recycle Coach's schedule wants it: "zone-z<id>-z<id>…", from an address result's zones. */
export const zoneString = (zones: Record<string, string | number>) =>
  ["zone", ...Object.values(zones).map((v) => (String(v).startsWith("z") ? String(v) : `z${v}`))].join("-");

export function trimLookup(raw: unknown): ZoneMatch[] {
  const seen = new Set<string>();
  return lookupSchema
    .parse(raw)
    .results.map((r) => ({ address: r.address.slice(0, 120), zoneId: zoneString(r.zones) }))
    .filter((m) => {
      if (m.zoneId === "zone" || seen.has(m.address)) return false;
      seen.add(m.address);
      return true;
    })
    .slice(0, 10);
}

export async function lookupAddress(term: string, projectId: string, districtId: string): Promise<ZoneMatch[]> {
  const raw = await getFirst("/zone-setup/address/single", {
    sku: projectId,
    district: districtId,
    prompt: "undefined",
    term: term.trim().toUpperCase(),
  });
  return trimLookup(raw);
}

// ---- Schedule ----

const collectionsSchema = z
  .object({
    collections: z.object({ types: z.record(z.string(), z.object({ title: z.string() })) }).optional(),
    collection: z.object({ types: z.record(z.string(), z.object({ title: z.string() })) }).optional(),
  })
  .transform((d) => (d.collections ?? d.collection)?.types ?? {});

const schedulesSchema = z.object({
  DATA: z.array(
    z.object({
      months: z.array(
        z.object({
          events: z.array(
            z.object({
              date: z.string(),
              collections: z.array(z.object({ id: z.union([z.string(), z.number()]), status: z.string().optional() })).default([]),
            }),
          ),
        }),
      ),
    }),
  ),
});

/** Which bin a collection is, from its name, so the display can draw the right colour and icon. */
export function binKind(title: string): BinKind {
  const t = title.toLowerCase();
  if (/recycl|blue|paper|container/.test(t)) return "recycling";
  if (/organic|green|food|yard|compost|leaf|leaves/.test(t)) return "organics";
  if (/glass/.test(t)) return "glass";
  if (/garbage|trash|waste|refuse|black|grey|gray/.test(t)) return "garbage";
  return "other";
}

export function trimSchedule(collectionsRaw: unknown, schedulesRaw: unknown, today: string, days: number, now: number): GarbageData {
  const types = collectionsSchema.parse(collectionsRaw);
  const end = new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const byDate = new Map<string, { name: string; kind: BinKind }[]>();
  for (const year of schedulesSchema.parse(schedulesRaw).DATA) {
    for (const month of year.months) {
      for (const event of month.events) {
        const date = event.date.slice(0, 10);
        if (date < today || date >= end) continue;
        for (const c of event.collections) {
          if (c.status === "is_none") continue;
          const title = types[`collection-${c.id}`]?.title;
          if (!title) continue;
          const list = byDate.get(date) ?? [];
          if (!list.some((x) => x.name === title)) list.push({ name: title.slice(0, 40), kind: binKind(title) });
          byDate.set(date, list);
        }
      }
    }
  }
  const pickups = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, bins]) => ({ date, bins }));
  return { updatedAt: now, configured: true, pickups };
}

const localDate = (now: number, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

export async function garbageFeed(config: DashboardConfig, now = Date.now()): Promise<Cached<GarbageData>> {
  const g = config.integrations.garbage;
  if (!g.zoneId) return { value: { updatedAt: now, configured: false, pickups: [] }, fetchedAt: now, stale: false };
  const today = localDate(now, config.location.timeZone);
  return cached(
    `garbage:${g.projectId}:${g.districtId}:${g.zoneId}:${today}`,
    TTL,
    async () => {
      const params = { project_id: g.projectId, district_id: g.districtId, zone_id: g.zoneId };
      const [collections, schedules] = await Promise.all([
        getFirst("/zone-setup/zone/collections", { ...params, lang_cd: "en_US" }),
        getFirst("/zone-setup/zone/schedules", params),
      ]);
      // Eight weeks is the most a widget shows.
      return trimSchedule(collections, schedules, today, 57, now);
    },
    now,
  );
}
