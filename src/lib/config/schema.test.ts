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

  it("loads a dashboard saved before Google Tasks existed", () => {
    const c = defaultConfig() as unknown as { integrations: Record<string, unknown> };
    delete c.integrations.tasks;
    const r = configSchema.safeParse(c);
    expect(r.success && r.data.integrations.tasks).toEqual({ lists: [] });
  });

  it("loads a dashboard saved before commute times existed", () => {
    const c = defaultConfig() as unknown as { integrations: Record<string, unknown> };
    delete c.integrations.commute;
    const r = configSchema.safeParse(c);
    expect(r.success && r.data.integrations.commute).toEqual({ home: null, destinations: [] });
  });

  it("refuses more than six commute places, which would outrun TomTom's free tier", () => {
    const c = defaultConfig();
    const place = { label: "4700 Kingsway, Burnaby", latitude: 49.23, longitude: -123.0, name: "Work", emoji: "", arriveBy: "" };
    c.integrations.commute.destinations = Array.from({ length: 7 }, (_, i) => ({ ...place, id: `p${i}` }));
    expect(configSchema.safeParse(c).success).toBe(false);
    c.integrations.commute.destinations.pop();
    expect(configSchema.safeParse(c).success).toBe(true);
  });

  it("shows the month title on month calendars saved before the toggle existed", () => {
    const c = defaultConfig();
    const month = c.views.flatMap((v) => v.widgets).find((w) => w.type === "calendarMonth") as unknown as Record<string, unknown>;
    delete month.showTitle;
    delete month.showWeekends;
    const r = configSchema.safeParse(c);
    const parsed = r.success ? r.data.views.flatMap((v) => v.widgets).find((w) => w.type === "calendarMonth") : undefined;
    // A month widget saved before these settings existed still shows the whole month, weekends and title included.
    expect(parsed).toMatchObject({ showTitle: true, showWeekends: true });
    expect(parsed).not.toHaveProperty("weeks");
  });

  it("loads cameras saved before live video existed as Home Assistant snapshots", () => {
    const c = defaultConfig() as unknown as {
      integrations: Record<string, unknown> & { homeAssistant: { doorbell: Record<string, unknown> } };
      views: { widgets: Record<string, unknown>[] }[];
    };
    delete c.integrations.cameras;
    delete c.integrations.homeAssistant.doorbell.stream;
    c.views[0]!.widgets = [{ id: "cam", type: "camera", x: 0, y: 0, w: 4, h: 3, entityId: "camera.driveway", refreshSeconds: 10 }];
    const r = configSchema.safeParse(c);
    expect(r.success ? [] : r.error.issues).toEqual([]);
    if (!r.success) return;
    expect(r.data.integrations.cameras).toEqual({ go2rtcUrl: "" });
    expect(r.data.integrations.homeAssistant.doorbell.stream).toBe("");
    expect(r.data.views[0]!.widgets[0]).toMatchObject({ source: "homeAssistant", stream: "", format: "mp4", fit: "cover" });
  });

  it.each([
    ["https://cams.example.com:8443", true],
    ["https://cams.example.com:8443/go2rtc/", true],
    ["", true],
    // The dashboard is https; screens refuse (or can't upgrade) plain http video from it.
    ["http://192.168.0.10:1984", false],
    ["https://admin:secret@cams.example.com", false],
    ["https://cams.example.com/?token=1", false],
    ["rtsps://192.168.0.203:7441/abc", false],
  ])("takes %s as the go2rtc address: %s", (url, ok) => {
    const c = defaultConfig();
    c.integrations.cameras.go2rtcUrl = url;
    expect(configSchema.safeParse(c).success).toBe(ok);
  });

  it("only takes go2rtc stream names that are safe in a link", () => {
    const c = defaultConfig();
    c.integrations.homeAssistant.doorbell.stream = "front_door-hd.2";
    expect(configSchema.safeParse(c).success).toBe(true);
    c.integrations.homeAssistant.doorbell.stream = "front door&src=x";
    expect(configSchema.safeParse(c).success).toBe(false);
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
