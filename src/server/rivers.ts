import "server-only";

import type { DashboardConfig } from "@/lib/config/schema";
import type { RiversData, RiverStationData } from "@/lib/display/types";
import { RIVER_PRESETS, RIVER_STATION_RE, summarise, type RiverReading } from "@/lib/rivers";

import { cached } from "./cache";

// River levels (Melvin, 2026-11-25): Environment Canada's real-time hydrometric data, no key. The Water Survey of
// Canada publishes each gauge's level (and flow, where it is measured) every five minutes, a few hours behind. Claude's
// pick of source: MSC GeoMet's OGC API (`hydrometric-realtime`, JSON with the station's name), falling back to the
// Datamart's hourly CSV for the same station when the API fails. Each station is read at most every ten minutes and
// shared by every household and display; the wall gets only names and numbers. This sandbox can't reach either host,
// so tests use the shapes in MSC's documentation.

const TTL = 10 * 60_000;
const API = "https://api.weather.gc.ca/collections/hydrometric-realtime/items";
// The Datamart moved its files under dated folders in 2025 (`today/` is the current day); the old path is tried too.
const DATAMART = ["https://dd.weather.gc.ca/today/hydrometric/csv", "https://dd.weather.gc.ca/hydrometric/csv"];
const HOURS = 30;

interface StationRead {
  name: string;
  readings: RiverReading[];
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** GeoJSON from the OGC API; property names as in MSC's `hydrometric-realtime` collection. Lenient on everything. */
export function parseRealtime(raw: unknown): StationRead {
  const features = (raw as { features?: unknown })?.features;
  let name = "";
  const readings: RiverReading[] = [];
  for (const f of Array.isArray(features) ? features : []) {
    const p = (f as { properties?: Record<string, unknown> })?.properties;
    if (!p) continue;
    const t = Date.parse(String(p.DATETIME ?? ""));
    if (!Number.isFinite(t)) continue;
    if (!name && typeof p.STATION_NAME === "string") name = p.STATION_NAME;
    readings.push({ t, level: num(p.LEVEL), discharge: num(p.DISCHARGE) });
  }
  return { name: titleCase(name), readings };
}

/**
 * The Datamart's CSV (`ID,Date,Water Level / Niveau d'eau (m),Grade,Symbol,QA/QC,Discharge / Débit (cms),…`).
 * Columns are found by their header, so a reordered or extra column doesn't break it.
 */
export function parseCsv(text: string): RiverReading[] {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const header = (lines.shift() ?? "").split(",").map((c) => c.toLowerCase());
  const at = header.findIndex((c) => c.startsWith("date"));
  const lv = header.findIndex((c) => c.includes("water level"));
  const q = header.findIndex((c) => c.includes("discharge"));
  if (at < 0 || (lv < 0 && q < 0)) return [];
  const readings: RiverReading[] = [];
  for (const line of lines) {
    const cells = line.split(",");
    const t = Date.parse(cells[at] ?? "");
    if (!Number.isFinite(t)) continue;
    readings.push({ t, level: lv < 0 ? null : num(cells[lv]), discharge: q < 0 ? null : num(cells[q]) });
  }
  return readings;
}

/** "FRASER RIVER AT MISSION" → "Fraser River at Mission". */
export function titleCase(name: string): string {
  const small = new Set(["at", "of", "near", "above", "below", "and", "the"]);
  return name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.replace(/(^|[-'(])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())))
    .join(" ");
}

async function readApi(id: string, now: number): Promise<StationRead> {
  const from = new Date(now - HOURS * 3_600_000).toISOString().slice(0, 19) + "Z";
  const q = new URLSearchParams({ f: "json", STATION_NUMBER: id, datetime: `${from}/..`, limit: "1000" });
  const r = await fetch(`${API}?${q}`, { headers: { Accept: "application/geo+json" }, signal: AbortSignal.timeout(12_000) });
  if (!r.ok) throw new Error(`Environment Canada answered ${r.status}`);
  return parseRealtime(await r.json());
}

async function readCsv(id: string, now: number): Promise<RiverReading[]> {
  // The station's province is in the file name. Everydaypane's gauges are in B.C.; elsewhere the API above is the way.
  let last: unknown;
  for (const base of DATAMART) {
    try {
      const r = await fetch(`${base}/BC/hourly/BC_${id}_hourly_hydrometric.csv`, { signal: AbortSignal.timeout(12_000) });
      if (!r.ok) throw new Error(`Datamart answered ${r.status}`);
      const cutoff = now - HOURS * 3_600_000;
      return parseCsv(await r.text()).filter((x) => x.t >= cutoff);
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error("Datamart unavailable");
}

async function station(id: string, now: number): Promise<RiverStationData> {
  const fallbackName = RIVER_PRESETS.find((p) => p.id === id)?.name ?? id;
  const got = await cached(
    `rivers:${id}`,
    TTL,
    async () => {
      let read: StationRead;
      try {
        read = await readApi(id, now);
        if (!read.readings.length) throw new Error("No readings from the API");
      } catch (error) {
        console.error(`[rivers] ${id} API`, error);
        read = { name: "", readings: await readCsv(id, now) };
      }
      return { name: read.name, ...summarise(read.readings) };
    },
    now,
  ).catch((error: unknown) => {
    console.error(`[rivers] ${id}`, error);
    return null;
  });
  if (!got) return { id, name: fallbackName, ...summarise([]), error: "Environment Canada didn't answer" };
  const { name, ...rest } = got.value;
  return { id, name: name || fallbackName, ...rest, ...(rest.at === null ? { error: "No recent readings" } : {}) };
}

/** Every station on a rivers widget in the household's views, each once. */
export function riverStations(config: DashboardConfig): string[] {
  const ids = new Set<string>();
  for (const view of config.views)
    for (const w of view.widgets) if (w.type === "rivers") for (const s of w.stations) if (RIVER_STATION_RE.test(s.id)) ids.add(s.id);
  return [...ids].slice(0, 12);
}

export async function riversFeed(config: DashboardConfig, now = Date.now()): Promise<RiversData> {
  const stations = await Promise.all(riverStations(config).map((id) => station(id, now)));
  return { updatedAt: now, units: config.units, stations };
}

/** The household panel's check of a station number typed by hand: its name, or null when nothing reports there. */
export async function lookupStation(id: string, now = Date.now()): Promise<{ id: string; name: string; at: number | null } | null> {
  if (!RIVER_STATION_RE.test(id)) return null;
  const s = await station(id, now);
  return s.at === null ? null : { id, name: s.name, at: s.at };
}
