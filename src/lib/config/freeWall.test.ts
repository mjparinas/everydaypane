import { describe, expect, it } from "vitest";

import { effectivePlan, trialDaysLeft } from "../plans";
import { defaultConfig, isFreeSafeConfig } from "./defaults";
import { fitFree, lockForFree } from "./freeWall";

describe("Free wall after a trial", () => {
  it("fitFree leaves settings a Free household can publish", () => {
    const full = defaultConfig();
    expect(isFreeSafeConfig(full)).toBe(false);
    const fitted = fitFree(full);
    expect(isFreeSafeConfig(fitted)).toBe(true);
    // The original is untouched, so subscribing later restores it.
    expect(isFreeSafeConfig(full)).toBe(false);
  });

  it("lockForFree keeps each Household widget's cell as a paused note", () => {
    const full = defaultConfig();
    const first = full.views[0]!;
    const locked = lockForFree(full).views[0]!;
    expect(locked.widgets).toHaveLength(first.widgets.length);
    for (const [i, w] of first.widgets.entries()) {
      const l = locked.widgets[i]!;
      expect({ x: l.x, y: l.y, w: l.w, h: l.h }).toEqual({ x: w.x, y: w.y, w: w.w, h: w.h });
    }
    const paused = locked.widgets.filter((w) => w.type === "note" && w.text.startsWith("Paused"));
    expect(paused.length).toBeGreaterThan(0);
    expect(paused.every((w) => w.title)).toBe(true);
  });
});

describe("trial plan helpers", () => {
  const now = Date.UTC(2026, 11, 1, 12);
  it("works out the plan and days left", () => {
    expect(effectivePlan("free", null, now)).toBe("free");
    expect(effectivePlan("free", now + 1, now)).toBe("paid");
    expect(effectivePlan("free", now, now)).toBe("free");
    expect(effectivePlan("paid", now - 1, now)).toBe("paid");
    expect(trialDaysLeft(now + 14 * 86_400_000, now)).toBe(14);
    expect(trialDaysLeft(now + 3_600_000, now)).toBe(1);
    expect(trialDaysLeft(now - 1, now)).toBe(0);
  });
});
