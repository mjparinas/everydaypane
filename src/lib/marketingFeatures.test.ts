import { existsSync, readFileSync } from "node:fs";
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
    expect(FEATURE_BEHAVIOURS.map((b) => b.name)).toEqual(expect.arrayContaining(["Smart Notices", "Regional Packs"]));
  });

  it("has a committed picture of the stated size for every behaviour", () => {
    for (const b of FEATURE_BEHAVIOURS) {
      expect(b.image, `${b.name} has no picture`).toBeTruthy();
      const file = join(process.cwd(), "public", b.image!);
      expect(existsSync(file), `missing ${b.image} — run npm run templates:previews`).toBe(true);
      // A PNG's width and height are the two big-endian numbers at bytes 16 and 20.
      const png = readFileSync(file);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], b.image).toEqual([b.width, b.height]);
    }
  });

  it("has a committed sample PNG for every widget", () => {
    for (const type of WIDGET_TYPES) {
      const file = join(process.cwd(), "public", "features", "widgets", `${type}.png`);
      expect(existsSync(file), `missing ${widgetSamplePath(type)} — run npm run templates:previews`).toBe(true);
    }
  });
});
