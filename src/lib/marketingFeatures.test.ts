import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { WIDGET_TYPES } from "./config/widgets";
import { FEATURE_BEHAVIOURS, FEATURE_WIDGET_GROUPS, widgetSamplePath } from "./marketingFeatures";

describe("marketing features catalogue", () => {
  it("lists every widget type once with a sample image path", () => {
    const types = FEATURE_WIDGET_GROUPS.flatMap((g) => g.items.map((i) => i.type));
    expect(new Set(types).size).toBe(types.length);
    expect(types.sort()).toEqual([...WIDGET_TYPES].sort());
    for (const type of WIDGET_TYPES) {
      expect(widgetSamplePath(type)).toBe(`/features/widgets/${type}.png`);
    }
  });

  it("keeps display behaviour copy for the features page", () => {
    expect(FEATURE_BEHAVIOURS.length).toBeGreaterThanOrEqual(5);
  });

  it("has a committed sample PNG for every widget", () => {
    for (const type of WIDGET_TYPES) {
      const file = join(process.cwd(), "public", "features", "widgets", `${type}.png`);
      expect(existsSync(file), `missing ${widgetSamplePath(type)} — run npm run templates:previews`).toBe(true);
    }
  });
});
