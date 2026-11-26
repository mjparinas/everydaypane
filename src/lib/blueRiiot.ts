// Blue Riiot (Blue Connect) pool monitor (Melvin, 2026-11-26). Shared by the server's feed, the household panel and
// tests. The display gets each reading's level from the server and never imports this file.

export const POOL_KINDS = ["temp", "ph", "orp", "chlorine", "salinity"] as const;
export type PoolKind = (typeof POOL_KINDS)[number];

export const POOL_LABELS: Record<PoolKind, string> = {
  temp: "Water temperature",
  ph: "pH",
  orp: "ORP (sanitiser)",
  chlorine: "Free chlorine",
  salinity: "Salinity",
};

/** What a new widget shows. Free chlorine only appears when a test strip was scanned in the app. */
export const POOL_DEFAULT_KINDS: PoolKind[] = ["temp", "ph", "orp", "salinity"];

/**
 * The names Blue Riiot's `lastMeasurements` uses. A Blue Connect measures temperature, pH, ORP and (Plus and Go models)
 * conductivity as salinity; free chlorine comes only from a test strip scanned in the app, under a few names.
 */
export const POOL_MEASURE_NAMES: Record<string, PoolKind> = {
  temperature: "temp",
  ph: "ph",
  orp: "orp",
  salinity: "salinity",
  free_chlorine: "chlorine",
  chlorine: "chlorine",
  fcl: "chlorine",
  cl: "chlorine",
};

/** ok: inside Blue Riiot's ideal range; warn: outside it but inside the warning range; bad: outside both. */
export type PoolLevel = "ok" | "warn" | "bad" | "none";

export interface PoolRange {
  okMin?: number | null;
  okMax?: number | null;
  warnLow?: number | null;
  warnHigh?: number | null;
}

/**
 * Used when Blue Riiot's answer has no range for a reading. pH and ORP are Blue Riiot's own app bands (ideal pH 7.2 to
 * 7.6, ORP 650 to 750 mV); chlorine is the usual 1 to 3 ppm. Temperature and salinity depend on the pool (a salt pool's
 * cell names its own range), so without Blue Riiot's range they are shown uncoloured.
 */
export const POOL_FALLBACK: Partial<Record<PoolKind, PoolRange>> = {
  ph: { okMin: 7.2, okMax: 7.6, warnLow: 6.8, warnHigh: 8.0 },
  orp: { okMin: 650, okMax: 750, warnLow: 550, warnHigh: 850 },
  chlorine: { okMin: 1, okMax: 3, warnLow: 0.5, warnHigh: 5 },
};

const num = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** Blue Riiot's range, field by field over the fallback, so a reading with only an ideal range still gets warning bounds. */
export function poolRange(kind: PoolKind, given: PoolRange): PoolRange {
  const f = POOL_FALLBACK[kind] ?? {};
  const pick = (a: number | null | undefined, b: number | null | undefined) => (num(a) ? a : num(b) ? b : null);
  return {
    okMin: pick(given.okMin, f.okMin),
    okMax: pick(given.okMax, f.okMax),
    warnLow: pick(given.warnLow, f.warnLow),
    warnHigh: pick(given.warnHigh, f.warnHigh),
  };
}

export function poolLevel(value: number, range: PoolRange | undefined): PoolLevel {
  if (!range || (!num(range.okMin) && !num(range.okMax))) return "none";
  const inOk = (!num(range.okMin) || value >= range.okMin) && (!num(range.okMax) || value <= range.okMax);
  if (inOk) return "ok";
  const low = num(range.okMin) && value < range.okMin;
  const edge = low ? range.warnLow : range.warnHigh;
  // No warning bound on that side: out of the ideal range is only a warning (a cold pool in November isn't an alarm).
  if (!num(edge)) return "warn";
  return low ? (value >= edge ? "warn" : "bad") : value <= edge ? "warn" : "bad";
}
