import { describe, expect, it } from "vitest";

import { FREE_LIMITS, isFreeWidgetType, isHouseholdSettingsGroup, isHouseholdTab, limitsFor, planLabel, UPGRADE_REASONS } from "./plans";

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

  it("marks Household-only household tabs and settings groups", () => {
    expect(isHouseholdTab("meals")).toBe(true);
    expect(isHouseholdTab("views")).toBe(false);
    expect(isHouseholdSettingsGroup("tasks")).toBe(true);
    expect(isHouseholdSettingsGroup("home")).toBe(false);
  });

  it("has upgrade copy for soft Free CTAs", () => {
    expect(UPGRADE_REASONS.widget).toMatch(/Household/);
    expect(UPGRADE_REASONS.view).toMatch(/view/i);
  });
});
