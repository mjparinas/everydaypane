import { describe, expect, it } from "vitest";

import { defaultConfig } from "./defaults";
import { currentPeriod, dateInZone, daysBetween, minutesInZone, msUntilNextPeriod } from "./time";

const VAN = "America/Vancouver";
function at(hhmm: string): Date {
  return new Date(Date.parse(`2026-11-17T${hhmm}:00Z`) + 7 * 60 * 60_000);
}

describe("time of day", () => {
  const { schedule } = defaultConfig();

  it("reads the wall clock in the dashboard's zone", () => {
    expect(minutesInZone(at("07:30"), VAN)).toBe(450);
    expect(minutesInZone(new Date("2026-11-17T12:30:00Z"), "America/Toronto")).toBe(450);
  });

  it("keeps Vancouver on UTC-7 after the 2026 change even with stale browser time-zone data", () => {
    expect(minutesInZone(new Date("2026-11-17T15:30:00Z"), VAN)).toBe(510);
  });

  it.each([
    ["05:59", "night"],
    ["06:00", "morning"],
    ["10:59", "morning"],
    ["11:00", "afternoon"],
    ["18:30", "evening"],
    ["22:00", "night"],
    ["00:10", "night"],
  ])("at %s it is %s", (t, period) => {
    expect(currentPeriod(schedule, at(t), VAN)).toBe(period);
  });

  it("counts down to the next period, across midnight", () => {
    expect(msUntilNextPeriod(schedule, at("10:00"), VAN)).toBe(60 * 60_000);
    expect(msUntilNextPeriod(schedule, at("23:00"), VAN)).toBe(7 * 60 * 60_000);
  });

  it("finds the date in a zone", () => {
    expect(dateInZone(at("23:30"), VAN)).toBe("2026-11-17");
    expect(dateInZone(new Date("2026-11-18T03:00:00Z"), "America/Toronto")).toBe("2026-11-17");
    expect(daysBetween("2026-11-17", "2026-12-25")).toBe(38);
  });
});
