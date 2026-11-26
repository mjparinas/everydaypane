import { describe, expect, it } from "vitest";

import { auroraFor, parseKpForecast, tonight } from "./aurora";

const home = { latitude: 49.1, longitude: -122.6, timeZone: "America/Vancouver" };

// The two shapes NOAA has served noaa-planetary-k-index-forecast.json in: rows under a header row, and objects (2025).
const rows = [
  ["time_tag", "kp", "observed", "noaa_scale"],
  ["2026-11-25 18:00:00", "2.67", "observed", null],
  ["2026-11-25 21:00:00", "3.00", "estimated", null],
  ["2026-11-26 00:00:00", "4.33", "predicted", null],
  ["2026-11-26 03:00:00", "6.00", "predicted", "G2"],
  ["2026-11-26 06:00:00", "5.33", "predicted", "G1"],
  ["2026-11-26 09:00:00", "4.00", "predicted", null],
  ["2026-11-26 12:00:00", "3.67", "predicted", null],
  ["2026-11-26 15:00:00", "3.00", "predicted", null],
  ["2026-11-26 18:00:00", "2.33", "predicted", null],
  ["2026-11-27 03:00:00", "8.00", "predicted", "G4"],
];
const objects = rows.slice(1).map(([time_tag, kp, observed, noaa_scale]) => ({ time_tag, kp: Number(kp), observed, noaa_scale }));

describe("aurora forecast", () => {
  it("reads both of NOAA's shapes the same way", () => {
    const a = parseKpForecast(rows);
    expect(a).toHaveLength(10);
    expect(a[0]).toEqual({ start: Date.UTC(2026, 10, 25, 18), kp: 2.67, predicted: false });
    expect(parseKpForecast(objects)).toEqual(a);
    expect(parseKpForecast({ nope: true })).toEqual([]);
  });

  it("takes tonight as the coming run of dark blocks, not tomorrow night", () => {
    const blocks = parseKpForecast(rows);
    // 2:30 PM in Langley (UTC−7): tonight is 5 PM to 5 AM local, 00:00–12:00 UTC.
    const night = tonight(blocks, Date.UTC(2026, 10, 25, 21, 30), home.timeZone);
    expect(night.map((b) => new Date(b.start).getUTCHours())).toEqual([0, 3, 6, 9]);
  });

  it("gives the peak, the chance at home and the blocks from now", () => {
    const out = auroraFor(parseKpForecast(rows), home, Date.UTC(2026, 10, 25, 21, 30));
    expect(out).toMatchObject({ kpNow: 3, tonightKp: 6, chance: "possible", storm: 2, tonightAt: "2026-11-26T03:00:00.000Z" });
    expect(out.kpForHorizon).toBeCloseTo(5.33, 1);
    expect(out.blocks[0]).toEqual({ start: "2026-11-25T21:00:00.000Z", kp: 3, predicted: false });
    expect(out.blocks).toHaveLength(8);
  });
});
