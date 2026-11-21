import { SCREEN_SAVER_OFF } from "../screenSaver";
import type { DashboardConfig, View, Widget } from "./schema";
import { BUILT_IN_THEMES } from "./themes";
import { newWidget } from "./widgets";

// The dashboard a fresh install starts with: tuned for a 1920 × 1080 landscape screen (the UC-Display21).

const VAN = "America/Vancouver";

function w(widget: Widget, at: Pick<Widget, "x" | "y" | "w" | "h">, patch: Partial<Widget> = {}): Widget {
  return { ...widget, ...at, ...patch } as Widget;
}

const christmas = { id: "christmas", name: "Christmas", date: "2026-12-25", emoji: "🎄", kind: "holiday", yearly: true } as const;
const newYear = { id: "new-year", name: "New Year's Day", date: "2027-01-01", emoji: "🎆", kind: "holiday", yearly: true } as const;
const canadaDay = { id: "canada-day", name: "Canada Day", date: "2027-07-01", emoji: "🇨🇦", kind: "holiday", yearly: true } as const;
const halloween = { id: "halloween", name: "Halloween", date: "2027-10-31", emoji: "🎃", kind: "holiday", yearly: true } as const;

const home: View = {
  id: "home",
  name: "Home",
  cols: 12,
  rows: 8,
  gap: 16,
  padding: 14,
  themeId: null,
  widgets: [
    w(newWidget("clock", "home-clock-van", { x: 0, y: 0 }), { x: 0, y: 0, w: 4, h: 2 }),
    w(newWidget("clock", "home-clock-tor", { x: 0, y: 0 }), { x: 4, y: 0, w: 2, h: 1 }, {
      timeZone: "America/Toronto",
      label: "Toronto",
    } as Partial<Widget>),
    w(newWidget("date", "home-date", { x: 0, y: 0 }), { x: 4, y: 1, w: 2, h: 1 }),
    w(newWidget("weather", "home-weather", { x: 0, y: 0 }), { x: 6, y: 0, w: 6, h: 3 }),
    w(newWidget("agenda", "home-agenda", { x: 0, y: 0 }), { x: 0, y: 2, w: 4, h: 6 }),
    w(newWidget("airQuality", "home-aq", { x: 0, y: 0 }), { x: 4, y: 2, w: 2, h: 1 }),
    w(newWidget("photos", "home-photos", { x: 0, y: 0 }), { x: 4, y: 3, w: 5, h: 5 }),
    w(newWidget("garbage", "home-garbage", { x: 0, y: 0 }), { x: 9, y: 3, w: 3, h: 2 }),
    w(newWidget("countdown", "home-countdown", { x: 0, y: 0 }), { x: 9, y: 5, w: 3, h: 3 }, {
      events: [christmas, newYear, canadaDay, halloween],
      count: 3,
    } as Partial<Widget>),
  ],
};

const morning: View = {
  id: "morning",
  name: "Morning",
  cols: 12,
  rows: 8,
  gap: 16,
  padding: 14,
  themeId: null,
  widgets: [
    w(newWidget("clock", "m-clock", { x: 0, y: 0 }), { x: 0, y: 0, w: 4, h: 2 }),
    w(newWidget("weather", "m-weather", { x: 0, y: 0 }), { x: 4, y: 0, w: 8, h: 3 }, { showHourly: true } as Partial<Widget>),
    w(newWidget("agenda", "m-agenda", { x: 0, y: 0 }), { x: 0, y: 2, w: 4, h: 6 }),
    w(newWidget("garbage", "m-garbage", { x: 0, y: 0 }), { x: 4, y: 3, w: 4, h: 2 }),
    w(newWidget("messages", "m-messages", { x: 0, y: 0 }), { x: 8, y: 3, w: 4, h: 5 }),
    w(newWidget("airQuality", "m-aq", { x: 0, y: 0 }), { x: 4, y: 5, w: 4, h: 3 }),
  ],
};

const calendar: View = {
  id: "calendar",
  name: "Calendar",
  cols: 12,
  rows: 8,
  gap: 16,
  padding: 14,
  themeId: null,
  widgets: [
    w(newWidget("calendarMonth", "c-month", { x: 0, y: 0 }), { x: 0, y: 0, w: 9, h: 8 }),
    w(newWidget("clock", "c-clock", { x: 0, y: 0 }), { x: 9, y: 0, w: 3, h: 2 }),
    w(newWidget("agenda", "c-agenda", { x: 0, y: 0 }), { x: 9, y: 2, w: 3, h: 6 }, { range: "upcoming", days: 7 } as Partial<Widget>),
  ],
};

const night: View = {
  id: "night",
  name: "Night",
  cols: 12,
  rows: 8,
  gap: 16,
  padding: 20,
  themeId: null,
  widgets: [
    w(newWidget("clock", "n-clock", { x: 0, y: 0 }), { x: 0, y: 0, w: 12, h: 5 }, { label: "" } as Partial<Widget>),
    w(newWidget("date", "n-date", { x: 0, y: 0 }), { x: 0, y: 5, w: 12, h: 1 }),
    w(newWidget("weather", "n-weather", { x: 0, y: 0 }), { x: 0, y: 6, w: 6, h: 2 }, { days: 3 } as Partial<Widget>),
    w(newWidget("garbage", "n-garbage", { x: 0, y: 0 }), { x: 6, y: 6, w: 3, h: 2 }),
    w(newWidget("wifiQr", "n-wifi", { x: 0, y: 0 }), { x: 9, y: 6, w: 3, h: 2 }),
  ],
};

export function defaultConfig(): DashboardConfig {
  return {
    name: "Everydaypane",
    location: { name: "Langley, BC", latitude: 49.1044, longitude: -122.6604, timeZone: VAN },
    units: "metric",
    hour12: true,
    themeId: "aurora",
    themes: structuredClone(BUILT_IN_THEMES),
    views: structuredClone([home, morning, calendar, night]),
    alerts: {
      enabled: true,
      sources: { alertReady: true, weather: true, roads: true, earthquakes: true, power: true },
      banner: "moderate",
      radiusKm: 100,
      minMagnitude: 4,
      powerKm: 5,
    },
    chores: { people: [], items: [] },
    burnIn: { shift: true, maxPixels: 6, minutes: 3 },
    screenSaver: { ...SCREEN_SAVER_OFF, photoSourceIds: [], motionEntityIds: [] },
    schedule: {
      enabled: true,
      morning: { start: "06:00", viewId: "morning", mode: "day", dim: 0 },
      afternoon: { start: "11:00", viewId: "home", mode: "day", dim: 0 },
      evening: { start: "18:00", viewId: "home", mode: "night", dim: 0 },
      night: { start: "22:00", viewId: "night", mode: "night", dim: 0.45 },
    },
    integrations: {
      google: { calendars: [] },
      tasks: { lists: [] },
      icals: [],
      // Township of Langley's Recycle Coach calendar (tol.ca collection calendars). The zone is found from the address in
      // the admin panel, or picked by hand (Monday A, Tuesday B, …).
      garbage: { projectId: "521", districtId: "LANGL", zoneId: "", zoneLabel: "" },
      photos: { sources: [] },
      commute: { home: null, destinations: [] },
      sports: { teams: [] },
      homeAssistant: { url: "", doorbell: { entityId: "", cameraEntityId: "", seconds: 30 } },
    },
  };
}
