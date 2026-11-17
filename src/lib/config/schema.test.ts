import { describe, expect, it } from "vitest";

import { defaultConfig } from "./defaults";
import { configSchema, type Palette } from "./schema";
import { BUILT_IN_THEMES } from "./themes";
import { newWidget, WIDGET_TYPES, WIDGETS } from "./widgets";

describe("config schema", () => {
  it("accepts the default dashboard", () => {
    const r = configSchema.safeParse(defaultConfig());
    expect(r.success ? [] : r.error.issues).toEqual([]);
  });

  it("rejects a widget that runs off its grid", () => {
    const c = defaultConfig();
    c.views[0]!.widgets[0]!.x = 11;
    expect(configSchema.safeParse(c).success).toBe(false);
  });

  it("rejects a schedule that names a missing view", () => {
    const c = defaultConfig();
    c.schedule.night.viewId = "gone";
    expect(configSchema.safeParse(c).success).toBe(false);
  });

  it("rejects an unknown time zone", () => {
    const c = defaultConfig();
    c.location.timeZone = "Mars/Olympus";
    expect(configSchema.safeParse(c).success).toBe(false);
  });

  it("gives every widget type defaults that validate", () => {
    for (const type of WIDGET_TYPES) {
      const c = defaultConfig();
      const w = newWidget(type, `new-${type}`, { x: 0, y: 0 });
      if (w.type === "wifiQr") w.ssid = "Home";
      c.views[0]!.widgets = [w];
      const r = configSchema.safeParse(c);
      expect(r.success ? [] : r.error.issues, type).toEqual([]);
      expect(WIDGETS[type].minSize.w).toBeLessThanOrEqual(WIDGETS[type].size.w);
    }
  });

  it("keeps default widgets from overlapping", () => {
    for (const view of defaultConfig().views) {
      const cells = new Set<string>();
      for (const w of view.widgets)
        for (let x = w.x; x < w.x + w.w; x++)
          for (let y = w.y; y < w.y + w.h; y++) {
            const k = `${x},${y}`;
            expect(cells.has(k), `${view.id}: ${w.id} overlaps at ${k}`).toBe(false);
            cells.add(k);
          }
    }
  });
});

// WCAG relative luminance and contrast ratio.
function luminance(hex: string): number {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

describe("built-in themes", () => {
  it.each(BUILT_IN_THEMES.flatMap((t) => [[`${t.name} day`, t.day] as const, [`${t.name} night`, t.night] as const]))(
    "%s passes AA contrast",
    (_name, p: Palette) => {
      for (const bg of [p.surface, p.background]) {
        expect(contrast(p.text, bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.muted, bg)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(p.accent, p.surface)).toBeGreaterThanOrEqual(3);
    },
  );
});
