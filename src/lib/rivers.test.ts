import { describe, expect, it } from "vitest";

import { summarise, trendOf, type RiverReading } from "./rivers";

const T0 = Date.parse("2026-11-25T12:00:00Z");
const H = 3_600_000;

/** A reading every 5 minutes for `hours`, level from `level(hoursAgo)`. */
function series(hours: number, level: (hoursAgo: number) => number, discharge: number | null = 1500): RiverReading[] {
  const out: RiverReading[] = [];
  for (let m = hours * 60; m >= 0; m -= 5) out.push({ t: T0 - m * 60_000, level: level(m / 60), discharge });
  return out;
}

describe("river summary", () => {
  it("reads the latest level, the 6 and 24 hour change and the trend", () => {
    // Rising 1 cm an hour.
    const s = summarise(series(30, (ago) => 4 - ago * 0.01));
    expect(s.level).toBe(4);
    expect(s.at).toBe(T0);
    expect(s.change6h).toBeCloseTo(0.06, 3);
    expect(s.change24h).toBeCloseTo(0.24, 3);
    expect(s.trend).toBe("rising");
    expect(s.discharge).toBe(1500);
  });

  it("calls a centimetre's wobble steady and a drop falling", () => {
    expect(summarise(series(8, (ago) => 2 + (ago % 2 ? 0.005 : 0))).trend).toBe("steady");
    expect(summarise(series(8, (ago) => 2 + ago * 0.01)).trend).toBe("falling");
    expect(trendOf(null)).toBeNull();
  });

  it("gives a day of hourly levels, oldest first, with gaps as null", () => {
    const readings = series(24, (ago) => 3 + ago / 100).filter((r) => r.t < T0 - 10 * H || r.t > T0 - 8 * H);
    const s = summarise(readings);
    expect(s.spark).toHaveLength(24);
    expect(s.spark.at(-1)).toBe(3);
    expect(s.spark.filter((v) => v === null).length).toBeGreaterThanOrEqual(1);
  });

  it("has no change when there's no reading near six hours ago", () => {
    const s = summarise(series(2, () => 1.2));
    expect(s.change6h).toBeNull();
    expect(s.change24h).toBeNull();
    expect(s.trend).toBeNull();
  });

  it("takes flow from the newest reading that has one, and copes with nothing at all", () => {
    const readings = series(1, () => 5, null);
    readings[3]!.discharge = 2100;
    expect(summarise(readings).discharge).toBe(2100);
    expect(summarise([])).toMatchObject({ level: null, at: null, trend: null, spark: [] });
  });
});
