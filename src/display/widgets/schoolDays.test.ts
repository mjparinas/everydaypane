// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { daysAway, todayLines, tomorrowLine } from "./schoolDays";

describe("school days widget", () => {
  it("counts days away in calendar days", () => {
    expect(daysAway("2026-11-23", "2026-11-23")).toBe("today");
    expect(daysAway("2026-11-23", "2026-11-24")).toBe("tomorrow");
    expect(daysAway("2026-11-23", "2026-12-18")).toBe("in 25 days");
  });

  it("writes today's line", () => {
    expect(todayLines({ state: "school" }, "Pizza day")).toEqual({ main: "School today", cls: "sd-school", sub: "Lunch: Pizza day" });
    expect(todayLines({ state: "off", name: "Pro-D Day", backOn: "2026-10-26" }, "").sub).toBe("Pro-D Day · back Monday, Oct 26");
    expect(todayLines({ state: "summer", backOn: "2026-09-08" }, "").sub).toBe("School starts Tuesday, Sep 8");
  });

  it("says something about tomorrow only when it's worth saying", () => {
    expect(tomorrowLine({ state: "school" }, { state: "off", name: "Pro-D Day", backOn: null }, "")).toBe(
      "Tomorrow: no school (Pro-D Day)",
    );
    expect(
      tomorrowLine({ state: "off", name: "Winter break", backOn: null }, { state: "off", name: "Winter break", backOn: null }, ""),
    ).toBe("");
    expect(tomorrowLine({ state: "off", name: "Winter break", backOn: null }, { state: "school" }, "Sushi")).toBe(
      "Back to school tomorrow · Lunch: Sushi",
    );
    expect(tomorrowLine({ state: "school" }, { state: "school" }, "")).toBe("");
    expect(tomorrowLine({ state: "school" }, { state: "school", early: "Early dismissal (conferences)" }, "")).toBe(
      "Tomorrow: early dismissal (conferences)",
    );
  });
});
