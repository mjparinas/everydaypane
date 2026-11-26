import "server-only";

import { auroraChance, kpNeeded, magneticLatitude, stormLevel } from "@/lib/aurora";
import type { AuroraData } from "@/lib/display/types";
import { zonedFormatter } from "@/lib/timeZone";

import { cached, getJson } from "./cache";

// Aurora tonight (Melvin, 2026-11-25) from NOAA's Space Weather Prediction Center: the planetary Kp forecast, which
// lists the last few days observed and estimated and the next three days predicted, in three-hour blocks, with no
// key. One read every 30 minutes serves every household; each household's chance is worked out from its own
// latitude here (src/lib/aurora.ts), so displays never get coordinates. NOAA moved its JSON products from rows with a
// header row to objects in 2025, so both shapes are read.

const URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json";
const TTL = 30 * 60_000;
const BLOCK = 3 * 3_600_000;

export interface KpBlock {
  /** Start of the three-hour block, ms. */
  start: number;
  kp: number;
  predicted: boolean;
}

function parseTime(v: unknown): number {
  if (typeof v !== "string") return Number.NaN;
  // "2026-11-25 21:00:00" is UTC.
  const iso = v.includes("T") ? v : v.replace(" ", "T");
  return Date.parse(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
}

export function parseKpForecast(raw: unknown): KpBlock[] {
  if (!Array.isArray(raw)) return [];
  let rows: Record<string, unknown>[];
  const [head, ...rest] = raw as unknown[];
  if (Array.isArray(head)) {
    const keys = head.map((k) => String(k).toLowerCase());
    rows = rest.filter(Array.isArray).map((r) => Object.fromEntries(keys.map((k, i) => [k, (r as unknown[])[i]])));
  } else {
    rows = (raw as unknown[])
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
      .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), v])));
  }
  const out: KpBlock[] = [];
  for (const r of rows) {
    const start = parseTime(r.time_tag);
    const kp = Number(r.kp);
    if (!Number.isFinite(start) || !Number.isFinite(kp) || kp < 0 || kp > 9) continue;
    out.push({ start, kp, predicted: String(r.observed ?? "").toLowerCase() === "predicted" });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Local hour (0–23) at `ms` in the dashboard's zone. */
function hourAt(ms: number, timeZone: string): number {
  return Number(zonedFormatter(timeZone, { hour: "numeric", hourCycle: "h23" }).format(ms)) % 24;
}

/**
 * The blocks of the coming night: from the current block on, the first run whose middle falls between 6 PM and
 * 6 AM local time. In the small hours that is the rest of this night.
 */
export function tonight(blocks: KpBlock[], now: number, timeZone: string): KpBlock[] {
  const night: KpBlock[] = [];
  for (const b of blocks) {
    if (b.start + BLOCK <= now) continue;
    const hour = hourAt(b.start + BLOCK / 2, timeZone);
    const dark = hour >= 18 || hour < 6;
    if (dark) night.push(b);
    else if (night.length) break;
  }
  return night;
}

export function auroraFor(
  blocks: KpBlock[],
  home: { latitude: number; longitude: number; timeZone: string },
  now: number,
): Omit<AuroraData, "updatedAt"> {
  const magLat = magneticLatitude(home.latitude, home.longitude);
  const kpForHorizon = Math.round(kpNeeded(magLat).possible * 3) / 3;
  const done = blocks.filter((b) => !b.predicted && b.start <= now);
  const latest = done[done.length - 1];
  const night = tonight(blocks, now, home.timeZone);
  const peak = night.reduce<KpBlock | undefined>((a, b) => (!a || b.kp > a.kp ? b : a), undefined);
  const current = blocks.findIndex((b) => b.start + BLOCK > now);
  return {
    kpNow: latest?.kp,
    kpNowAt: latest ? new Date(latest.start).toISOString() : undefined,
    tonightKp: peak?.kp,
    tonightAt: peak ? new Date(peak.start).toISOString() : undefined,
    chance: peak ? auroraChance(peak.kp, magLat) : "unlikely",
    kpForHorizon,
    storm: peak ? stormLevel(peak.kp) : 0,
    blocks: (current < 0 ? [] : blocks.slice(current, current + 8)).map((b) => ({
      start: new Date(b.start).toISOString(),
      kp: Math.round(b.kp * 100) / 100,
      predicted: b.predicted,
    })),
  };
}

export async function auroraFeed(home: { latitude: number; longitude: number; timeZone: string }, now = Date.now()): Promise<AuroraData> {
  try {
    const { value, fetchedAt, stale } = await cached(
      "aurora:kp-forecast",
      TTL,
      async () => {
        const blocks = parseKpForecast(await getJson(URL, { headers: { Accept: "application/json" } }, 10_000));
        if (!blocks.length) throw new Error("NOAA's Kp forecast was empty");
        return blocks;
      },
      now,
    );
    return { updatedAt: fetchedAt, stale, ...auroraFor(value, home, now) };
  } catch (error) {
    console.error("[aurora]", error);
    return {
      updatedAt: now,
      error: "NOAA's space weather forecast isn't answering",
      chance: "unlikely",
      kpForHorizon: 0,
      storm: 0,
      blocks: [],
    };
  }
}
