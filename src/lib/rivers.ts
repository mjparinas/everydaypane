// River levels (Melvin, 2026-11-25: "build that all", river and creek levels among them). Environment Canada's
// real-time hydrometric stations, read by src/server/rivers.ts. Shared by the server, the household panel and tests;
// the display gets finished numbers and never imports this file.
//
// It sits beside the NAAD flood warnings on the alert strip rather than repeating them: the strip says when officials
// warn, this shows how high the water is and which way it's going.

/** A Water Survey of Canada station number: two digits, two letters, three digits (08MH024). */
export const RIVER_STATION_RE = /^\d{2}[A-Z]{2}\d{3}$/;

/** Stations offered with one tap in the widget's settings. Any other station can be added by number. */
export const RIVER_PRESETS: { id: string; name: string }[] = [
  { id: "08MH024", name: "Fraser River at Mission" },
  { id: "08MF005", name: "Fraser River at Hope" },
  { id: "08MH090", name: "Salmon River at 72 Avenue, Langley" },
  { id: "08MH155", name: "Nicomekl River at 203 Street, Langley" },
  { id: "08MH001", name: "Chilliwack River at Vedder Crossing" },
];

/** What a new widget shows: the Fraser at Mission and Langley's two creeks with gauges. */
export const RIVER_DEFAULT_STATIONS = ["08MH024", "08MH090", "08MH155"];

export interface RiverReading {
  /** Epoch ms. */
  t: number;
  /** Water level in metres above the gauge's own datum. */
  level: number | null;
  /** Flow in m³/s. */
  discharge: number | null;
}

export type RiverTrend = "rising" | "falling" | "steady";

export interface RiverSummary {
  level: number | null;
  discharge: number | null;
  /** When the latest reading was taken, epoch ms. */
  at: number | null;
  change6h: number | null;
  change24h: number | null;
  trend: RiverTrend | null;
  /** Hourly levels for the last 24 hours, oldest first; null where there was no reading that hour. */
  spark: (number | null)[];
}

/** Changes smaller than this over six hours count as steady: gauges wobble by a centimetre with wind and waves. */
export const STEADY_M = 0.015;

const HOUR = 3_600_000;

/** The reading closest to `t`, if one is within `slack` of it. */
function near(readings: RiverReading[], t: number, slack: number): RiverReading | undefined {
  let best: RiverReading | undefined;
  for (const r of readings) {
    if (r.level === null || Math.abs(r.t - t) > slack) continue;
    if (!best || Math.abs(r.t - t) < Math.abs(best.t - t)) best = r;
  }
  return best;
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

export function trendOf(change: number | null): RiverTrend | null {
  if (change === null) return null;
  if (change >= STEADY_M) return "rising";
  if (change <= -STEADY_M) return "falling";
  return "steady";
}

/** Latest level and flow, the change over 6 and 24 hours, and a day of hourly levels, from any order of readings. */
export function summarise(input: RiverReading[]): RiverSummary {
  const readings = input.filter((r) => Number.isFinite(r.t)).sort((a, b) => a.t - b.t);
  const withLevel = readings.filter((r) => r.level !== null);
  const latest = withLevel.at(-1) ?? readings.at(-1);
  if (!latest) return { level: null, discharge: null, at: null, change6h: null, change24h: null, trend: null, spark: [] };
  // Flow is published less often than level at some stations, so take the newest flow on its own.
  const flow = [...readings].reverse().find((r) => r.discharge !== null);
  const change = (hours: number) => {
    if (latest.level === null) return null;
    const then = near(withLevel, latest.t - hours * HOUR, hours >= 24 ? 2 * HOUR : HOUR);
    return then && then.level !== null ? round(latest.level - then.level, 3) : null;
  };
  const change6h = change(6);
  const spark: (number | null)[] = [];
  for (let i = 23; i >= 0; i--) {
    const end = latest.t - i * HOUR;
    const inHour = withLevel.filter((r) => r.t > end - HOUR && r.t <= end).at(-1);
    spark.push(inHour?.level ?? null);
  }
  return {
    level: latest.level,
    discharge: flow?.discharge ?? null,
    at: latest.t,
    change6h,
    change24h: change(24),
    trend: trendOf(change6h),
    spark,
  };
}
