import { describe, expect, it } from "vitest";

import { fullMoonName, moonPath, moonPhase, newMoonAt } from "./moon";

const minutesApart = (a: number, b: number) => Math.abs(a - b) / 60_000;
const utcMonth = (ms: number) => new Date(ms).getUTCMonth();

describe("moon phase", () => {
  it("matches Meeus's worked example, the new moon of 1977 February 18 at 03:37:42 TD", () => {
    expect(minutesApart(newMoonAt(-283), Date.UTC(1977, 1, 18, 3, 37, 42) - 69_000)).toBeLessThan(2);
  });

  it("finds the eclipse new moon of 8 April 2024 (18:21 UTC) and the full moon after it (23 April, 23:49 UTC)", () => {
    const before = moonPhase(Date.UTC(2024, 3, 8, 12));
    expect(before.name).toBe("New moon");
    expect(minutesApart(before.nextNew, Date.UTC(2024, 3, 8, 18, 21))).toBeLessThan(3);
    expect(minutesApart(before.nextFull, Date.UTC(2024, 3, 23, 23, 49))).toBeLessThan(3);
  });

  it("names the phases through a month", () => {
    const at = (day: number) => moonPhase(Date.UTC(2024, 3, day, 12)).name;
    expect(at(8)).toBe("New moon");
    expect(at(11)).toBe("Waxing crescent");
    expect(at(15)).toBe("First quarter");
    expect(at(19)).toBe("Waxing gibbous");
    expect(at(24)).toBe("Full moon");
    expect(at(27)).toBe("Waning gibbous");
    expect(moonPhase(Date.UTC(2024, 4, 1, 12)).name).toBe("Last quarter");
    expect(moonPhase(Date.UTC(2024, 4, 4, 12)).name).toBe("Waning crescent");
  });

  it("lights the disc from nothing to all of it and back", () => {
    expect(moonPhase(Date.UTC(2024, 3, 8, 18, 21)).illumination).toBeLessThan(0.01);
    expect(moonPhase(Date.UTC(2024, 3, 23, 23, 49)).illumination).toBeGreaterThan(0.99);
    const quarter = moonPhase(Date.UTC(2024, 3, 15, 19, 13)).illumination;
    expect(quarter).toBeGreaterThan(0.4);
    expect(quarter).toBeLessThan(0.6);
  });

  it("gives full moons their traditional names, with the Harvest Moon nearest the September equinox", () => {
    expect(fullMoonName(Date.UTC(2024, 3, 23, 23, 49), utcMonth)).toBe("Pink Moon");
    expect(fullMoonName(Date.UTC(2024, 11, 15, 9, 2), utcMonth)).toBe("Cold Moon");
    expect(fullMoonName(Date.UTC(2024, 8, 18, 2, 34), utcMonth)).toBe("Harvest Moon");
    expect(fullMoonName(Date.UTC(2024, 9, 17, 11, 26), utcMonth)).toBe("Hunter's Moon");
  });

  it("draws a crescent bowing towards its lit side and a gibbous moon away from it", () => {
    expect(moonPath(0.1, 50)).toBe("M50 0A50 50 0 0 1 50 100A40.45 50 0 0 0 50 0Z");
    expect(moonPath(0.4, 50)).toBe("M50 0A50 50 0 0 1 50 100A40.45 50 0 0 1 50 0Z");
    expect(moonPath(0.9, 50)).toBe("M50 0A50 50 0 0 0 50 100A40.45 50 0 0 1 50 0Z");
  });
});
