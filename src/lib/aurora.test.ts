import { describe, expect, it } from "vitest";

import { auroraChance, kpNeeded, magneticLatitude, stormLevel } from "./aurora";

describe("aurora chance", () => {
  it("puts Langley at about 54° magnetic latitude", () => {
    expect(magneticLatitude(49.1, -122.6)).toBeCloseTo(54.4, 0);
  });

  it("follows the Lower Mainland's usual advice: Kp 6 low on the horizon, Kp 7 a good show", () => {
    const lat = magneticLatitude(49.1, -122.6);
    expect(auroraChance(3, lat)).toBe("unlikely");
    expect(auroraChance(5, lat)).toBe("slim");
    expect(auroraChance(6, lat)).toBe("possible");
    expect(auroraChance(7, lat)).toBe("good");
    expect(kpNeeded(lat).possible).toBeCloseTo(5.3, 1);
  });

  it("needs much less in Yellowknife", () => {
    expect(auroraChance(3, magneticLatitude(62.45, -114.37))).toBe("good");
  });

  it("names NOAA's storm levels", () => {
    expect([4.67, 5, 6.33, 7, 8, 9].map(stormLevel)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
