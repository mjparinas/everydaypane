import { describe, expect, it } from "vitest";

import { assignees, daysLabel, dueOn, weekStart } from "./chores";
import type { Chore, ChorePerson } from "./config/schema";

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const chore = (over: Partial<Chore>): Chore => ({
  id: "bed",
  name: "Make the bed",
  emoji: "🛏️",
  stars: 1,
  days: EVERY_DAY,
  personIds: ["ana", "ben"],
  rotate: "none",
  ...over,
});
const person = (id: string): ChorePerson => ({ id, name: id, emoji: "", color: "#1c7ed6", goal: 0 });

// 2026-11-16 is a Monday.
describe("weekStart", () => {
  it("finds the Monday of the week", () => {
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
    expect(weekStart("2026-11-20")).toBe("2026-11-16");
    expect(weekStart("2026-11-22")).toBe("2026-11-16"); // Sunday ends the week
    expect(weekStart("2026-11-23")).toBe("2026-11-23");
  });
});

describe("assignees", () => {
  it("gives a shared chore to everyone on it", () => {
    expect(assignees(chore({}), "2026-11-18")).toEqual(["ana", "ben"]);
  });

  it("gives nobody a chore on a day it isn't due", () => {
    expect(assignees(chore({ days: [6] }), "2026-11-18")).toEqual([]);
  });

  it("takes turns every day for a daily rotation", () => {
    const c = chore({ rotate: "day" });
    expect(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"].map((d) => assignees(c, d))).toEqual([
      ["ana"],
      ["ben"],
      ["ana"],
      ["ben"],
    ]);
  });

  it("takes turns each time the chore is due, not each calendar day", () => {
    const c = chore({ rotate: "day", days: [1, 3, 5] });
    expect(["2026-11-16", "2026-11-18", "2026-11-20", "2026-11-23"].map((d) => assignees(c, d))).toEqual([
      ["ana"],
      ["ben"],
      ["ana"],
      ["ben"],
    ]);
  });

  it("gives a weekly rotation to one person all week, then the next", () => {
    const c = chore({ rotate: "week", personIds: ["ana", "ben", "cy"] });
    const week = ["2026-11-16", "2026-11-19", "2026-11-22"].map((d) => assignees(c, d)[0]);
    expect(new Set(week).size).toBe(1);
    expect(assignees(c, "2026-11-23")).not.toEqual(assignees(c, "2026-11-16"));
    expect(assignees(c, "2026-12-07")).toEqual(assignees(c, "2026-11-16")); // three weeks on, back to the start
  });

  it("skips people who are no longer on the chart", () => {
    const c = chore({ rotate: "day" });
    expect(assignees(c, "2026-11-16", new Set(["ben"]))).toEqual(["ben"]);
    expect(assignees(c, "2026-11-17", new Set(["ben"]))).toEqual(["ben"]);
    expect(assignees(c, "2026-11-17", new Set())).toEqual([]);
  });
});

describe("dueOn", () => {
  it("lists each chore and person due that day in the chart's order", () => {
    const chores = [chore({ id: "bed" }), chore({ id: "dishes", rotate: "day" }), chore({ id: "lawn", days: [6] })];
    expect(dueOn([person("ana"), person("ben")], chores, "2026-11-16")).toEqual([
      { choreId: "bed", personId: "ana" },
      { choreId: "bed", personId: "ben" },
      { choreId: "dishes", personId: "ana" },
    ]);
  });
});

describe("daysLabel", () => {
  it("names common patterns and lists the rest from Monday", () => {
    expect(daysLabel(EVERY_DAY)).toBe("Every day");
    expect(daysLabel([5, 1, 2, 3, 4])).toBe("Weekdays");
    expect(daysLabel([6, 0])).toBe("Weekends");
    expect(daysLabel([0, 3, 1])).toBe("Mon, Wed, Sun");
  });
});
