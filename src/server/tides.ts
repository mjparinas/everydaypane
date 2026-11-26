import "server-only";

import { z } from "zod";

import type { DashboardConfig } from "@/lib/config/schema";
import type { TideCurve, TideEvent, TidesData } from "@/lib/display/types";

import { cached, type Cached } from "./cache";

// Tides (Phase 3): NOAA CO-OPS for US numeric stations; Canadian IWLS for `iwls:` plus the five-digit station number
// on Fisheries and Oceans' tide tables (White Rock is iwls:07577, Point Atkinson iwls:07795).
//
// Reworked 2026-11-25 (Melvin asked for tides with a day curve): IWLS's data route takes its own station id, not the
// station number, so the number is looked up once a day through /stations?code=; its answer is a bare list of
// readings, and the wlp-hilo series doesn't say which are highs, so that comes from the neighbouring readings. The
// day curve is the predicted level (NOAA every 30 minutes, IWLS's wlp series) for two hours back and 22 ahead,
// fetched only for stations on a widget with `showCurve`.

const TTL = 45 * 60_000;
const NOAA = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
const IWLS = "https://api.iwls-schw.ca/api/v1";

const noaaSchema = z.object({
  predictions: z.array(z.object({ t: z.string(), type: z.enum(["H", "L"]).optional(), v: z.string() })).default([]),
});

const iwlsReadings = z.array(z.object({ eventDate: z.string(), value: z.number() }).loose());
const iwlsStation = z.object({ id: z.string(), code: z.string(), officialName: z.string() }).loose();

// The widget's first default was iwls:8320, which is not a station number; it meant Point Atkinson.
const LEGACY_CODES: Record<string, string> = { "8320": "07795" };

function stationKind(id: string): "noaa" | "iwls" | null {
  if (/^\d{5,8}$/.test(id)) return "noaa";
  if (id.startsWith("iwls:")) return "iwls";
  return null;
}

/** The IWLS station number, five digits with leading zeros, or the station's own id when one was pasted. */
export function iwlsCode(id: string): string {
  const raw = id.replace(/^iwls:/, "").trim();
  if (/^\d{1,5}$/.test(raw)) return LEGACY_CODES[raw] ?? raw.padStart(5, "0");
  return raw;
}

/** IWLS wants whole seconds: 2026-11-25T08:00:00Z. */
const iwlsTime = (ms: number) => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");

async function iwlsStationId(stationId: string): Promise<string> {
  const code = iwlsCode(stationId);
  if (!/^\d{5}$/.test(code)) return code;
  const { value } = await cached(`tides:iwls-station:${code}`, 24 * 3_600_000, async () => {
    const r = await fetch(`${IWLS}/stations?code=${code}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) throw new Error(`Canadian tides answered ${r.status}`);
    const found = z.array(iwlsStation).parse(await r.json())[0];
    if (!found) throw new Error(`No Canadian tide station ${code}`);
    return found.id;
  });
  return value;
}

async function iwlsSeries(stationId: string, series: "wlp-hilo" | "wlp", from: number, to: number) {
  const id = await iwlsStationId(stationId);
  const url = `${IWLS}/stations/${encodeURIComponent(id)}/data?time-series-code=${series}&from=${iwlsTime(from)}&to=${iwlsTime(to)}`;
  const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
  if (!r.ok) throw new Error(`Canadian tides answered ${r.status}`);
  return parseIwlsReadings(await r.json());
}

/** IWLS readings as [ms, metres], oldest first. Older answers wrapped the list in `series`. */
export function parseIwlsReadings(raw: unknown): [number, number][] {
  const list = Array.isArray(raw) ? raw : ((raw as { series?: unknown } | null)?.series ?? []);
  const parsed = iwlsReadings.safeParse(list);
  if (!parsed.success) return [];
  return parsed.data
    .map((r) => [Date.parse(r.eventDate), r.value] as [number, number])
    .filter(([t]) => Number.isFinite(t))
    .sort((a, b) => a[0] - b[0]);
}

/** Highs and lows alternate, so each turning point is a high when it is above its neighbours' average. */
export function labelHiLo(readings: [number, number][]): TideEvent[] {
  return readings.map(([t, v], i) => {
    const near = [readings[i - 1]?.[1], readings[i + 1]?.[1]].filter((x): x is number => x !== undefined);
    const around = near.length ? near.reduce((a, b) => a + b, 0) / near.length : v;
    return { time: new Date(t).toISOString(), type: v >= around ? "high" : "low", height: v };
  });
}

async function noaa(stationId: string, now: number, interval: "hilo" | "30", hours: number): Promise<[number, number, string?][]> {
  const q = new URLSearchParams({
    product: "predictions",
    application: "everydaypane",
    begin_date: noaaDate(now - 2 * 3_600_000),
    range: String(hours),
    datum: "MLLW",
    station: stationId,
    time_zone: "gmt",
    interval,
    units: "metric",
    format: "json",
  });
  const r = await fetch(`${NOAA}?${q}`, { signal: AbortSignal.timeout(12_000) });
  if (!r.ok) throw new Error(`NOAA answered ${r.status}`);
  const body = noaaSchema.parse(await r.json());
  return body.predictions.map((p) => [Date.parse(`${p.t.replace(" ", "T")}:00Z`), Number(p.v), p.type]);
}

/** NOAA's begin_date in GMT: yyyyMMdd HH:mm. */
function noaaDate(ms: number): string {
  const d = new Date(ms).toISOString();
  return `${d.slice(0, 10).replace(/-/g, "")} ${d.slice(11, 16)}`;
}

async function events(stationId: string, now: number): Promise<TideEvent[]> {
  const kind = stationKind(stationId);
  if (kind === "noaa")
    return (await noaa(stationId, now, "hilo", 50)).map(([t, v, type]) => ({
      time: new Date(t).toISOString(),
      type: type === "H" ? "high" : "low",
      height: v,
    }));
  if (kind === "iwls") return labelHiLo(await iwlsSeries(stationId, "wlp-hilo", now - 12 * 3_600_000, now + 48 * 3_600_000));
  return [];
}

const CURVE_STEP = 30;
const CURVE_POINTS = 49;

/** Readings resampled to every 30 minutes from `start` (linear between readings), 24 hours of them. */
export function resample(readings: [number, number][], start: number): number[] {
  const out: number[] = [];
  let j = 0;
  for (let i = 0; i < CURVE_POINTS; i++) {
    const t = start + i * CURVE_STEP * 60_000;
    while (j + 1 < readings.length && readings[j + 1]![0] <= t) j++;
    const a = readings[j];
    const b = readings[j + 1];
    if (!a || t < a[0] || (!b && t > a[0])) break;
    const v = b ? a[1] + ((b[1] - a[1]) * (t - a[0])) / (b[0] - a[0]) : a[1];
    out.push(Math.round(v * 100) / 100);
  }
  return out;
}

async function curve(stationId: string, now: number): Promise<TideCurve | null> {
  const start = Math.floor(now / 3_600_000) * 3_600_000 - 2 * 3_600_000;
  const end = start + (CURVE_POINTS - 1) * CURVE_STEP * 60_000;
  const kind = stationKind(stationId);
  const readings =
    kind === "noaa"
      ? (await noaa(stationId, start + 2 * 3_600_000, "30", 25)).map(([t, v]) => [t, v] as [number, number])
      : kind === "iwls"
        ? await iwlsSeries(stationId, "wlp", start - 3_600_000, end + 3_600_000)
        : [];
  const heights = resample(readings, start);
  return heights.length > 2 ? { start: new Date(start).toISOString(), stepMinutes: CURVE_STEP, heights } : null;
}

function stationsFromWidgets(config: DashboardConfig): { stationId: string; stationName: string; count: number; curve: boolean }[] {
  const map = new Map<string, { stationName: string; count: number; curve: boolean }>();
  for (const view of config.views) {
    for (const w of view.widgets) {
      if (w.type !== "tides" || !w.stationId) continue;
      const seen = map.get(w.stationId);
      map.set(w.stationId, {
        stationName: w.stationName,
        count: Math.max(w.count, seen?.count ?? 0),
        curve: w.showCurve || (seen?.curve ?? false),
      });
    }
  }
  return [...map.entries()].map(([stationId, meta]) => ({ stationId, ...meta }));
}

export interface TidesFeed extends TidesData {
  byStation: Record<string, TideEvent[]>;
}

export async function tidesFeed(accountId: string, config: DashboardConfig, now = Date.now()): Promise<Cached<TidesFeed>> {
  const stations = stationsFromWidgets(config);
  const key = `tides:v2:${accountId}:${stations.map((s) => `${s.stationId}${s.curve ? "~" : ""}`).join(",")}`;
  return cached(
    key,
    TTL,
    async () => {
      const byStation: Record<string, TideEvent[]> = {};
      const curves: Record<string, TideCurve> = {};
      const units: "m" | "ft" = config.units === "imperial" ? "ft" : "m";
      for (const s of stations) {
        try {
          // Keep the one that just went by, so the wall can say "Low 5:42 AM" for a little while.
          byStation[s.stationId] = (await events(s.stationId, now))
            .filter((e) => Date.parse(e.time) > now - 3_600_000)
            .slice(0, s.count * 2);
        } catch (error) {
          console.error(`[tides] ${s.stationId}`, error);
          byStation[s.stationId] = [];
        }
        if (s.curve) {
          try {
            const c = await curve(s.stationId, now);
            if (c) curves[s.stationId] = c;
          } catch (error) {
            console.error(`[tides] curve ${s.stationId}`, error);
          }
        }
      }
      const first = stations[0];
      return {
        updatedAt: now,
        stationId: first?.stationId ?? "",
        stationName: first?.stationName ?? "",
        events: first ? (byStation[first.stationId] ?? []) : [],
        units,
        byStation,
        curves,
      };
    },
    now,
  );
}

/** NOAA station search for the admin picker (fixtures in tests). */
export function trimNoaaStations(raw: unknown): { id: string; name: string; region: string }[] {
  const rows = (raw as { stations?: { id?: string; name?: string; state?: string }[] }).stations ?? [];
  return rows
    .filter((s) => s.id && s.name)
    .slice(0, 12)
    .map((s) => ({ id: s.id!, name: s.name!.slice(0, 80), region: (s.state ?? "").slice(0, 40) }));
}

export interface TideStation {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}

const iwlsListed = z.array(
  z
    .object({
      code: z.string(),
      officialName: z.string(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      timeSeries: z.array(z.object({ code: z.string() }).loose()).optional(),
    })
    .loose(),
);

/** Canadian stations that publish tide predictions, from IWLS's full list (about a thousand; kept a day). */
export function trimIwlsStations(raw: unknown): TideStation[] {
  const parsed = iwlsListed.safeParse(raw);
  if (!parsed.success) return [];
  return parsed.data
    .filter((s) => /^\d{5}$/.test(s.code) && (!s.timeSeries || s.timeSeries.some((t) => t.code === "wlp-hilo")))
    .map((s) => ({ id: `iwls:${s.code}`, label: s.officialName.slice(0, 80), latitude: s.latitude ?? 0, longitude: s.longitude ?? 0 }));
}

export async function iwlsStations(): Promise<TideStation[]> {
  const { value } = await cached("tides:iwls-stations", 24 * 3_600_000, async () => {
    const r = await fetch(`${IWLS}/stations`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`Canadian tides answered ${r.status}`);
    const list = trimIwlsStations(await r.json());
    if (!list.length) throw new Error("Canadian tides listed no stations");
    return list;
  });
  return value;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Stations whose name has every word of the search, names that start with it first. */
export function matchIwlsStations(all: TideStation[], q: string): TideStation[] {
  const words = fold(q).split(/\s+/).filter(Boolean);
  const hits = all.filter((s) => words.every((w) => fold(s.label).includes(w)));
  const head = fold(q.trim());
  return hits
    .sort((a, b) => Number(fold(b.label).startsWith(head)) - Number(fold(a.label).startsWith(head)) || a.label.localeCompare(b.label))
    .slice(0, 8)
    .map((s) => ({ ...s, label: `${s.label} (${s.id.slice(5)})` }));
}
