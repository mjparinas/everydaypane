import "server-only";

import { z } from "zod";

import type { DashboardConfig } from "@/lib/config/schema";
import type { TideEvent, TidesData } from "@/lib/display/types";

import { cached, type Cached } from "./cache";

// Tides (Phase 3): NOAA CO-OPS for US numeric stations; Canadian IWLS for iwls: codes (Langley → Point Atkinson 8320).

const TTL = 45 * 60_000;
const NOAA = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
const IWLS = "https://api.iwls-schw.ca/api/v1";

const noaaSchema = z.object({
  predictions: z.array(z.object({ t: z.string(), type: z.enum(["H", "L"]), v: z.string() })).default([]),
});

const iwlsSchema = z.object({
  series: z.array(z.object({ eventDate: z.string(), value: z.number(), qualifier: z.string().optional() })).default([]),
});

function stationKind(id: string): "noaa" | "iwls" | null {
  if (/^\d{5,8}$/.test(id)) return "noaa";
  if (id.startsWith("iwls:")) return "iwls";
  return null;
}

function iwlsId(id: string): string {
  return id.replace(/^iwls:/, "");
}

async function noaaPredictions(stationId: string, now: number): Promise<TideEvent[]> {
  const q = new URLSearchParams({
    product: "predictions",
    application: "everydaypane",
    begin_date: new Date(now - 3_600_000).toISOString().slice(0, 10).replace(/-/g, ""),
    range: "48",
    datum: "MLLW",
    station: stationId,
    time_zone: "lst_ldt",
    interval: "hilo",
    units: "metric",
    format: "json",
  });
  const r = await fetch(`${NOAA}?${q}`, { signal: AbortSignal.timeout(12_000) });
  if (!r.ok) throw new Error(`NOAA answered ${r.status}`);
  const body = noaaSchema.parse(await r.json());
  return body.predictions.map((p) => ({
    time: p.t.replace(" ", "T"),
    type: p.type === "H" ? "high" : "low",
    height: Number(p.v),
  }));
}

async function iwlsPredictions(stationId: string, now: number): Promise<TideEvent[]> {
  const from = new Date(now - 3_600_000).toISOString();
  const to = new Date(now + 48 * 3_600_000).toISOString();
  const url = `${IWLS}/stations/${encodeURIComponent(iwlsId(stationId))}/data?time-series-code=wlp-hilo&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
  if (!r.ok) throw new Error(`Canadian tides answered ${r.status}`);
  const body = iwlsSchema.parse(await r.json());
  return body.series.map((s) => {
    const high = (s.qualifier ?? "").toUpperCase().includes("H");
    return {
      time: s.eventDate,
      type: high ? "high" : "low",
      height: s.value,
    };
  });
}

function stationsFromWidgets(config: DashboardConfig): { stationId: string; stationName: string; count: number }[] {
  const map = new Map<string, { stationName: string; count: number }>();
  for (const view of config.views) {
    for (const w of view.widgets) {
      if (w.type !== "tides" || !w.stationId) continue;
      map.set(w.stationId, { stationName: w.stationName, count: w.count });
    }
  }
  return [...map.entries()].map(([stationId, meta]) => ({ stationId, ...meta }));
}

export interface TidesFeed extends TidesData {
  byStation: Record<string, TideEvent[]>;
}

export async function tidesFeed(accountId: string, config: DashboardConfig, now = Date.now()): Promise<Cached<TidesFeed>> {
  const stations = stationsFromWidgets(config);
  const key = `tides:${accountId}:${stations.map((s) => s.stationId).join(",")}`;
  return cached(
    key,
    TTL,
    async () => {
      const byStation: Record<string, TideEvent[]> = {};
      const units: "m" | "ft" = config.units === "imperial" ? "ft" : "m";
      for (const s of stations) {
        const kind = stationKind(s.stationId);
        try {
          if (kind === "noaa") byStation[s.stationId] = (await noaaPredictions(s.stationId, now)).slice(0, s.count * 2);
          else if (kind === "iwls") byStation[s.stationId] = (await iwlsPredictions(s.stationId, now)).slice(0, s.count * 2);
          else byStation[s.stationId] = [];
        } catch (error) {
          console.error(`[tides] ${s.stationId}`, error);
          byStation[s.stationId] = [];
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
