import "server-only";

import { distanceKm } from "@/lib/alerts";
import type { DashboardConfig } from "@/lib/config/schema";
import type { TransitData, TransitDeparture } from "@/lib/display/types";
import { agencyOf, stopKey, TRANSIT_AGENCIES, type TransitAgencyId } from "@/lib/transitAgencies";

import { cached } from "./cache";
import { env } from "./env";
import { decodeTripUpdates, parseCsv, readZipFiles, zipFromUrl, type RtTrip } from "./gtfs";

// TransLink departures (Melvin, 2026-11-19). Times come from TransLink's GTFS-realtime trip updates (the open API at
// gtfsapi.translink.ca, key in TRANSLINK_API_KEY), which predict every remaining stop of the trips under way and about
// to start. The static GTFS only supplies names: route numbers, headsigns and the stop list for the admin's stop
// search. It is read with range requests (stops, routes and trips only, never the big stop_times.txt) and kept for
// three days, since TransLink posts a new one each week. Setup: docs/translink.md.
//
// Regional packs (Melvin, 2026-11-26): the same reader serves every agency in src/lib/transitAgencies.ts (TTC, Calgary,
// Edmonton, Halifax, King County Metro), all open GTFS-realtime with no key. Each agency's realtime read and static
// names are cached on their own, so one agency being down never hides another's departures.

export const REALTIME_URL = TRANSIT_AGENCIES.translink.realtimeUrl;
export const STATIC_URL = TRANSIT_AGENCIES.translink.staticUrl;
/** How long one read of the realtime feed is shared by every display. About 2,900 calls a day at most, whatever the number of screens. */
const REALTIME_TTL = 30_000;
const STATIC_TTL = 3 * 86_400_000;
/** Departures further out than this aren't worth a line on the wall. */
const HORIZON_S = 2 * 3600;
const PER_STOP = 20;

// ---- Static names ----

/** What the static GTFS contributes, trimmed: [stop id, stop number, name, lat, lon] per stop, and names per route and trip. */
export interface StaticPack {
  routes: Record<string, string>;
  headsigns: string[];
  /** trip id → index into headsigns. */
  trips: Record<string, number>;
  /** "route id:direction id" → the most common headsign, for trips the pack doesn't know (a newer timetable). */
  byDirection: Record<string, number>;
  stops: [string, string, string, number, number][];
}

export const EMPTY_PACK: StaticPack = { routes: {}, headsigns: [], trips: {}, byDirection: {}, stops: [] };

export function buildPack(files: Map<string, string>): StaticPack {
  const routes: Record<string, string> = {};
  for (const r of parseCsv(files.get("routes.txt") ?? "")) {
    if (r.route_id) routes[r.route_id] = (r.route_short_name || r.route_long_name || r.route_id).slice(0, 12);
  }
  const headsigns: string[] = [];
  const index = new Map<string, number>();
  const trips: Record<string, number> = {};
  const counts = new Map<string, Map<number, number>>();
  for (const t of parseCsv(files.get("trips.txt") ?? "")) {
    if (!t.trip_id || !t.trip_headsign) continue;
    const sign = cleanHeadsign(t.trip_headsign, routes[t.route_id ?? ""] ?? "");
    let i = index.get(sign);
    if (i === undefined) {
      i = headsigns.push(sign) - 1;
      index.set(sign, i);
    }
    trips[t.trip_id] = i;
    const key = `${t.route_id}:${t.direction_id ?? ""}`;
    const c = counts.get(key) ?? new Map<number, number>();
    c.set(i, (c.get(i) ?? 0) + 1);
    counts.set(key, c);
  }
  const byDirection: Record<string, number> = {};
  for (const [key, c] of counts) byDirection[key] = [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const stops: StaticPack["stops"] = [];
  for (const s of parseCsv(files.get("stops.txt") ?? "")) {
    // Stations and entrances (location_type 1 to 4) have no departures of their own.
    if (!s.stop_id || (s.location_type && s.location_type !== "0")) continue;
    const lat = Number(s.stop_lat);
    const lon = Number(s.stop_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    stops.push([s.stop_id, s.stop_code ?? "", (s.stop_name ?? "").slice(0, 120), Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5]);
  }
  return { routes, headsigns, trips, byDirection, stops };
}

/** "502 Langley Centre" → "Langley Centre": the route number is drawn on its own. */
export function cleanHeadsign(sign: string, route: string): string {
  const s = sign.trim().replace(/\s+/g, " ");
  const cut = route && s.toLowerCase().startsWith(`${route.toLowerCase()} `) ? s.slice(route.length + 1) : s;
  return cut.slice(0, 60);
}

export async function staticPack(now = Date.now(), agency: TransitAgencyId = "translink"): Promise<StaticPack> {
  const r = await cached(
    // TransLink keeps its old cache key, so a deploy doesn't throw away three days of names.
    agency === "translink" ? "translink:static" : `transit:static:${agency}`,
    STATIC_TTL,
    async () => buildPack(await readZipFiles(await zipFromUrl(agencyOf(agency).staticUrl), ["routes.txt", "trips.txt", "stops.txt"])),
    now,
  );
  return r.value;
}

// ---- Departures ----

/** Every stop a transit widget shows, by agency: the only ones kept from each region-wide feed. */
export function usedStops(config: DashboardConfig): Map<TransitAgencyId, Set<string>> {
  const out = new Map<TransitAgencyId, Set<string>>();
  for (const v of config.views)
    for (const w of v.widgets)
      if (w.type === "transit") {
        const set = out.get(w.agency) ?? new Set<string>();
        for (const s of w.stops) set.add(s.id);
        if (set.size) out.set(w.agency, set);
      }
  return out;
}

export function departures(trips: RtTrip[], pack: StaticPack, stops: Set<string>, nowS: number): Record<string, TransitDeparture[]> {
  const out: Record<string, TransitDeparture[]> = {};
  for (const id of stops) out[id] = [];
  for (const trip of trips) {
    if (trip.canceled) continue;
    const route = pack.routes[trip.routeId] ?? trip.routeId;
    const signIndex = pack.trips[trip.tripId] ?? pack.byDirection[`${trip.routeId}:${trip.directionId ?? ""}`];
    const headsign = signIndex === undefined ? "" : (pack.headsigns[signIndex] ?? "");
    for (const s of trip.stops) {
      const list = out[s.stopId];
      // A minute's grace, so a bus that is a few seconds behind its prediction doesn't vanish early.
      if (!list || s.time < nowS - 60 || s.time > nowS + HORIZON_S) continue;
      // The feed can list a stop twice in one trip (a loop); the first is the one that leaves soonest.
      if (list.some((d) => d.time === s.time && d.route === route)) continue;
      list.push({ route, headsign, time: s.time, delay: s.delay, live: trip.hasVehicle });
    }
  }
  for (const id of Object.keys(out)) out[id] = (out[id] ?? []).sort((a, b) => a.time - b.time).slice(0, PER_STOP);
  return out;
}

export class TransLinkError extends Error {}

async function readRealtime(agency: TransitAgencyId, key: string): Promise<Uint8Array> {
  const a = agencyOf(agency);
  const url = a.needsKey ? `${a.realtimeUrl}?apikey=${encodeURIComponent(key)}` : a.realtimeUrl;
  const r = await fetch(url, {
    headers: { "User-Agent": "Everydaypane/1.0", Accept: "application/x-protobuf" },
    signal: AbortSignal.timeout(10_000),
  });
  // TransLink's key is in the address, so errors name only the status, never the URL.
  if (a.needsKey && (r.status === 401 || r.status === 403)) throw new TransLinkError(`${a.name} refused the API key`);
  if (!r.ok) throw new TransLinkError(`${a.name} answered ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

type AgencyDepartures = { updatedAt: number; stops: Record<string, TransitDeparture[]> };

async function agencyDepartures(agency: TransitAgencyId, stops: Set<string>, key: string, now: number) {
  const ids = [...stops].sort().join(",");
  return cached<AgencyDepartures>(
    agency === "translink" ? `translink:rt:${ids}` : `transit:rt:${agency}:${ids}`,
    REALTIME_TTL,
    async () => {
      // Names are nice to have: if the static file can't be read, departures still show, with the agency's route ids.
      const [feed, pack] = await Promise.all([readRealtime(agency, key), staticPack(now, agency).catch(() => EMPTY_PACK)]);
      return { updatedAt: now, stops: departures(decodeTripUpdates(feed, stops), pack, stops, Math.floor(now / 1000)) };
    },
    now,
  );
}

/**
 * Departures for every stop on a transit widget, filed under `stopKey(agency, id)`. `configured` is false until
 * TRANSLINK_API_KEY is set (only TransLink widgets care); `failed` names agencies whose feed couldn't be read just now.
 */
export async function transitFeed(config: DashboardConfig, now = Date.now()): Promise<{ value: TransitData; stale: boolean }> {
  const key = env.translinkKey();
  const used = usedStops(config);
  // Whether TRANSLINK_API_KEY is set; only TransLink widgets look at it.
  const configured = Boolean(key);
  const jobs = [...used].filter(([agency]) => agency !== "translink" || key);
  const results = await Promise.allSettled(jobs.map(([agency, stops]) => agencyDepartures(agency, stops, key, now)));
  const stops: Record<string, TransitDeparture[]> = {};
  const failed: TransitAgencyId[] = [];
  let stale = false;
  let updatedAt = now;
  results.forEach((r, i) => {
    const agency = jobs[i]?.[0] ?? "translink";
    if (r.status === "rejected") return void failed.push(agency);
    stale ||= r.value.stale;
    updatedAt = Math.min(updatedAt, r.value.value.updatedAt);
    for (const [id, list] of Object.entries(r.value.value.stops)) stops[stopKey(agency, id)] = list;
  });
  // Every feed down: let the route answer 502 as before, rather than an empty board that looks like no buses.
  if (jobs.length > 0 && failed.length === jobs.length) throw new TransLinkError("Live departures are unavailable right now");
  return { value: { updatedAt, configured, stops, ...(failed.length ? { failed } : {}) }, stale };
}

// ---- The admin's stop search ----

export interface StopMatch {
  id: string;
  code: string;
  name: string;
  /** From the dashboard's location. */
  km: number;
}

/**
 * Stops for the admin to pick: by stop number (the five digits on the bus stop sign), by name, or with nothing typed,
 * the ones nearest the dashboard's location.
 */
export function findStops(pack: StaticPack, query: string, at: { latitude: number; longitude: number }, limit = 12): StopMatch[] {
  const q = query.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const matches = pack.stops
    .filter(([, code, name]) => {
      if (!q) return true;
      if (/^\d+$/.test(q)) return code.startsWith(q);
      const n = name.toLowerCase();
      return words.every((w) => n.includes(w));
    })
    .map(([id, code, name, lat, lon]) => ({ id, code, name, km: Math.round(distanceKm(at.latitude, at.longitude, lat, lon) * 100) / 100 }));
  if (/^\d+$/.test(q)) matches.sort((a, b) => (a.code === q ? -1 : b.code === q ? 1 : a.km - b.km));
  else matches.sort((a, b) => a.km - b.km);
  return matches.slice(0, limit);
}
