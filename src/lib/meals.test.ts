import { describe, expect, it } from "vitest";

import { mergeMealPlan, nextMeal, normalizeRepeat, repeatLabel, ruleApplies } from "./meals";

describe("meal repeats", () => {
  it("applies weekday and interval cadences from the start date", () => {
    // 2026-11-23 is a Monday.
    expect(ruleApplies({ start: "2026-11-23", repeat: { kind: "weekdays", days: [1] } }, "2026-11-23")).toBe(true);
    expect(ruleApplies({ start: "2026-11-23", repeat: { kind: "weekdays", days: [1] } }, "2026-11-24")).toBe(false);
    expect(ruleApplies({ start: "2026-11-23", repeat: { kind: "weekdays", days: [1] } }, "2026-11-30")).toBe(true);
    expect(ruleApplies({ start: "2026-11-23", repeat: { kind: "weekdays", days: [1] } }, "2026-11-16")).toBe(false);

    expect(ruleApplies({ start: "2026-11-23", repeat: { kind: "interval", every: 2 } }, "2026-11-23")).toBe(true);
    expect(ruleApplies({ start: "2026-11-23", repeat: { kind: "interval", every: 2 } }, "2026-11-24")).toBe(false);
    expect(ruleApplies({ start: "2026-11-23", repeat: { kind: "interval", every: 2 } }, "2026-11-25")).toBe(true);
  });

  it("normalises and labels cadences", () => {
    expect(normalizeRepeat({ kind: "weekdays", days: [1, 1, 3] })).toEqual({ kind: "weekdays", days: [1, 3] });
    expect(normalizeRepeat({ kind: "weekdays", days: [] })).toBeNull();
    expect(normalizeRepeat({ kind: "interval", every: 0 })).toBeNull();
    expect(normalizeRepeat({ kind: "interval", every: 15 })).toBeNull();
    expect(repeatLabel({ kind: "interval", every: 1 })).toBe("Every day");
    expect(repeatLabel({ kind: "interval", every: 2 })).toBe("Every 2 days");
    expect(repeatLabel({ kind: "weekdays", days: [1] })).toBe("Every Mon");
    expect(repeatLabel({ kind: "weekdays", days: [1, 2, 3, 4, 5] })).toBe("Weekdays");
  });

  it("merges rules with one-offs and skips", () => {
    const rules = [
      { id: "r1", slot: "breakfast" as const, text: "Cereal", repeat: { kind: "weekdays" as const, days: [1] }, start: "2026-11-23" },
      { id: "r2", slot: "dinner" as const, text: "Pasta", repeat: { kind: "interval" as const, every: 2 }, start: "2026-11-23" },
    ];
    const { meals, origins } = mergeMealPlan("2026-11-23", 4, rules, {
      "2026-11-23": { dinner: "Tacos" },
      "2026-11-30": {},
      "2026-11-25": { dinner: "" },
    });
    expect(meals["2026-11-23"]).toEqual({ breakfast: "Cereal", dinner: "Tacos" });
    expect(origins["2026-11-23"]?.breakfast).toEqual({ source: "rule", ruleId: "r1" });
    expect(origins["2026-11-23"]?.dinner).toEqual({ source: "once" });
    expect(meals["2026-11-24"]).toBeUndefined();
    // 25th is Wednesday — breakfast rule doesn't apply; dinner would be Pasta but the empty one-off skips it.
    expect(meals["2026-11-25"]).toBeUndefined();
    expect(origins["2026-11-25"]).toBeUndefined();
  });

  it("knows which meal is next", () => {
    expect([6, 10, 13, 14, 19, 20, 23].map((h) => nextMeal(h))).toEqual([
      { slot: "breakfast", tomorrow: false },
      { slot: "lunch", tomorrow: false },
      { slot: "lunch", tomorrow: false },
      { slot: "dinner", tomorrow: false },
      { slot: "dinner", tomorrow: false },
      { slot: "breakfast", tomorrow: true },
      { slot: "breakfast", tomorrow: true },
    ]);
  });
});
