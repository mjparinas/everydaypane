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

  it("accepts an idle view that exists and refuses one that doesn't", () => {
    const c = defaultConfig();
    const viewId = c.views[0]!.id;
    c.screenSaver = { ...c.screenSaver, idle: true, shows: "view", viewId };
    expect(configSchema.safeParse(c).success).toBe(true);
    c.screenSaver.viewId = "gone";
    const r = configSchema.safeParse(c);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["screenSaver", "viewId"]);
    // Switched off, a stale choice doesn't block a save.
    c.screenSaver.idle = false;
    expect(configSchema.safeParse(c).success).toBe(true);
  });

  it("loads a dashboard saved before Google Tasks existed", () => {
    const c = defaultConfig() as unknown as { integrations: Record<string, unknown> };
    delete c.integrations.tasks;
    const r = configSchema.safeParse(c);
    expect(r.success && r.data.integrations.tasks).toEqual({ lists: [] });
  });

  it("loads a dashboard saved before the chore chart existed", () => {
    const c = defaultConfig() as unknown as Record<string, unknown>;
    delete c.chores;
    const r = configSchema.safeParse(c);
    expect(r.success && r.data.chores).toEqual({ people: [], items: [], rewards: [], pinSet: false });
  });

  it("refuses a chore with no days or nobody to do it", () => {
    const c = defaultConfig();
    c.chores.people = [{ id: "ana", name: "Ana", emoji: "", color: "#e8590c", goal: 0 }];
    c.chores.items = [
      { id: "bed", name: "Make the bed", emoji: "", stars: 1, days: [1], personIds: ["ana"], rotate: "none", period: "anytime" },
    ];
    expect(configSchema.safeParse(c).success).toBe(true);
    c.chores.items[0]!.days = [];
    expect(configSchema.safeParse(c).success).toBe(false);
    c.chores.items[0]!.days = [1];
    c.chores.items[0]!.personIds = [];
    expect(configSchema.safeParse(c).success).toBe(false);
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

  it("loads a dashboard saved before sports scores existed, and follows twelve teams at most", () => {
    const c = defaultConfig() as unknown as { integrations: Record<string, unknown> };
    delete c.integrations.sports;
    const r = configSchema.safeParse(c);
    expect(r.success && r.data.integrations.sports).toEqual({ teams: [] });
    const d = defaultConfig();
    const team = { league: "nhl" as const, teamId: "22", name: "Vancouver Canucks", abbr: "VAN", color: "#00205b" };
    d.integrations.sports.teams = Array.from({ length: 13 }, (_, i) => ({ ...team, id: `t${i}` }));
    expect(configSchema.safeParse(d).success).toBe(false);
    d.integrations.sports.teams.pop();
    expect(configSchema.safeParse(d).success).toBe(true);
    d.integrations.sports.teams[0]!.league = "cricket" as "nhl";
    expect(configSchema.safeParse(d).success).toBe(false);
  });

  it("fills tile padding on views saved before the control existed", () => {
    const c = defaultConfig() as unknown as { views: Record<string, unknown>[] };
    for (const v of c.views) delete v.tilePadding;
    const r = configSchema.safeParse(c);
    expect(r.success && r.data.views.every((v) => v.tilePadding === 16)).toBe(true);
  });

  it("shows the month title on month calendars saved before the toggle existed", () => {
    const c = defaultConfig();
    const month = c.views.flatMap((v) => v.widgets).find((w) => w.type === "calendarMonth") as unknown as Record<string, unknown>;
    delete month.showTitle;
    delete month.showWeekends;
    delete month.fitTitles;
    delete month.scrollWeeks;
    const r = configSchema.safeParse(c);
    const parsed = r.success ? r.data.views.flatMap((v) => v.widgets).find((w) => w.type === "calendarMonth") : undefined;
    // A month widget saved before these settings existed still shows the whole month, weekends and title included;
    // fit titles and scroll-after-3 are the new defaults (Melvin, 2026-11-22).
    expect(parsed).toMatchObject({ showTitle: true, showWeekends: true, fitTitles: true, scrollWeeks: 3 });
    expect(parsed).not.toHaveProperty("weeks");
  });

  it("keeps a panel, emoji and daylight on sunrise & sunset widgets saved before those toggles", () => {
    const c = defaultConfig();
    const sun = newWidget("sunTimes", "sun", { x: 0, y: 0 }) as unknown as Record<string, unknown>;
    delete sun.showBackground;
    delete sun.showEmoji;
    delete sun.showDaylight;
    c.views[0]!.widgets = [sun as ReturnType<typeof newWidget<"sunTimes">>];
    const r = configSchema.safeParse(c);
    const parsed = r.success ? r.data.views[0]!.widgets[0] : undefined;
    expect(parsed).toMatchObject({ type: "sunTimes", showBackground: true, showEmoji: true, showDaylight: true });
  });

  it("defaults clocks and dates to no panel, and other widgets to a panel", () => {
    const clock = newWidget("clock", "c", { x: 0, y: 0 });
    const weather = newWidget("weather", "w", { x: 0, y: 0 });
    expect(clock.showBackground).toBe(false);
    expect(weather.showBackground).toBe(true);
    const c = defaultConfig();
    c.views[0]!.widgets = [clock, weather];
    const r = configSchema.safeParse(c);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.views[0]!.widgets.map((w) => w.showBackground)).toEqual([false, true]);
  });

  it("accepts a per-widget font scale and rejects values outside 70–150 %", () => {
    const weather = { ...newWidget("weather", "w", { x: 0, y: 0 }), fontScale: 1.2 };
    const c = defaultConfig();
    c.views[0]!.widgets = [weather];
    expect(configSchema.safeParse(c).success).toBe(true);
    c.views[0]!.widgets = [{ ...weather, fontScale: 0.5 }];
    expect(configSchema.safeParse(c).success).toBe(false);
    c.views[0]!.widgets = [{ ...weather, fontScale: 2 }];
    expect(configSchema.safeParse(c).success).toBe(false);
  });

  it("accepts weather forecast icon size and rejects values outside 50–150 %", () => {
    const weather = { ...newWidget("weather", "w", { x: 0, y: 0 }), iconScale: 1.25 };
    const c = defaultConfig();
    c.views[0]!.widgets = [weather];
    expect(configSchema.safeParse(c).success).toBe(true);
    c.views[0]!.widgets = [{ ...weather, iconScale: 0.4 }];
    expect(configSchema.safeParse(c).success).toBe(false);
    c.views[0]!.widgets = [{ ...weather, iconScale: 1.6 }];
    expect(configSchema.safeParse(c).success).toBe(false);
  });

  it("accepts outer padding on a widget and keeps it optional", () => {
    const weather = { ...newWidget("weather", "w", { x: 0, y: 0 }), outerPadding: 12 };
    const c = defaultConfig();
    c.views[0]!.widgets = [weather];
    const r = configSchema.safeParse(c);
    expect(r.success && r.data.views[0]!.widgets[0]).toMatchObject({ type: "weather", outerPadding: 12 });
    const plain = newWidget("weather", "w2", { x: 0, y: 0 });
    expect(plain.outerPadding).toBeUndefined();
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

  it("allows a period to start at sunrise or sunset", () => {
    const c = defaultConfig();
    c.schedule.morning.start = "sunrise";
    c.schedule.evening.start = "sunset";
    expect(configSchema.safeParse(c).success).toBe(true);
    c.schedule.afternoon.start = "noon";
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
