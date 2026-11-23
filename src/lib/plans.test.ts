import { describe, expect, it } from "vitest";

import { FREE_LIMITS, isFreeWidgetType, limitsFor, planLabel } from "./plans";

describe("plans", () => {
  it("gives Free DAKboard-like caps", () => {
    expect(limitsFor("free")).toEqual(FREE_LIMITS);
    expect(FREE_LIMITS.views).toBe(1);
    expect(FREE_LIMITS.calendars).toBe(2);
    expect(FREE_LIMITS.displays).toBe(2);
  });

  it("allows core Free widgets only", () => {
    expect(isFreeWidgetType("clock")).toBe(true);
    expect(isFreeWidgetType("weather")).toBe(true);
    expect(isFreeWidgetType("chores")).toBe(false);
    expect(isFreeWidgetType("haEntity")).toBe(false);
  });

  it("labels the paid plan Household", () => {
    expect(planLabel("paid")).toBe("Household");
  });
});
