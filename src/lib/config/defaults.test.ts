import { describe, expect, it } from "vitest";

import { FREE_LIMITS, isFreeWidgetType } from "../plans";
import { defaultConfig, freeDefaultConfig, isFreeSafeConfig } from "./defaults";
import { configSchema } from "./schema";

describe("default configs", () => {
  it("gives Paid the multi-view kitchen layout with a schedule", () => {
    const c = defaultConfig();
    expect(configSchema.safeParse(c).success).toBe(true);
    expect(c.views.length).toBeGreaterThan(1);
    expect(c.schedule.enabled).toBe(true);
    expect(c.views.some((v) => v.widgets.some((w) => !isFreeWidgetType(w.type)))).toBe(true);
  });

  it("gives Free one view of Free widgets only, schedule off", () => {
    const c = freeDefaultConfig();
    expect(configSchema.safeParse(c).success).toBe(true);
    expect(c.views).toHaveLength(FREE_LIMITS.views);
    expect(c.schedule.enabled).toBe(false);
    expect(isFreeSafeConfig(c)).toBe(true);
    for (const w of c.views[0]!.widgets) {
      expect(isFreeWidgetType(w.type)).toBe(true);
      if (w.type === "photos") expect(w.intervalSeconds).toBeGreaterThanOrEqual(FREE_LIMITS.minPhotoIntervalSeconds);
    }
  });
});
