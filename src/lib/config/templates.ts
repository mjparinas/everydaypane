import type { View, Widget } from "./schema";
import { newWidget } from "./widgets";

// One-tap starter layouts for the Views tab (Melvin, 2026-11-22). Only Free-tier widgets so any household can apply them.

export interface ViewTemplate {
  id: string;
  name: string;
  description: string;
  /** Builds a fresh view (caller assigns id / name). */
  build: () => Omit<View, "id" | "name" | "themeId">;
}

function at(widget: Widget, spot: Pick<Widget, "x" | "y" | "w" | "h">, patch: Partial<Widget> = {}): Widget {
  return { ...widget, ...spot, ...patch } as Widget;
}

const christmas = { id: "christmas", name: "Christmas", date: "2026-12-25", emoji: "🎄", kind: "holiday" as const, yearly: true };
const newYear = { id: "new-year", name: "New Year's Day", date: "2027-01-01", emoji: "🎆", kind: "holiday" as const, yearly: true };

export const VIEW_TEMPLATES: ViewTemplate[] = [
  {
    id: "kitchen-glance",
    name: "Kitchen glance",
    description: "Clock, weather, today's schedule and photos — the everyday kitchen wall.",
    build: () => ({
      cols: 12,
      rows: 8,
      gap: 16,
      padding: 14,
      tilePadding: 16,
      widgets: [
        at(newWidget("clock", "t-clock", { x: 0, y: 0 }), { x: 0, y: 0, w: 4, h: 2 }),
        at(newWidget("date", "t-date", { x: 0, y: 0 }), { x: 4, y: 0, w: 2, h: 1 }),
        at(newWidget("airQuality", "t-aq", { x: 0, y: 0 }), { x: 4, y: 1, w: 2, h: 1 }),
        at(newWidget("weather", "t-weather", { x: 0, y: 0 }), { x: 6, y: 0, w: 6, h: 3 }),
        at(newWidget("agenda", "t-agenda", { x: 0, y: 0 }), { x: 0, y: 2, w: 4, h: 6 }),
        at(newWidget("photos", "t-photos", { x: 0, y: 0 }), { x: 4, y: 3, w: 5, h: 5 }),
        at(newWidget("countdown", "t-cd", { x: 0, y: 0 }), { x: 9, y: 3, w: 3, h: 5 }, {
          events: [christmas, newYear],
          count: 2,
        } as Partial<Widget>),
      ],
    }),
  },
  {
    id: "photo-frame",
    name: "Photo frame",
    description: "Photos fill the wall with a small clock and date in the corner.",
    build: () => ({
      cols: 12,
      rows: 8,
      gap: 12,
      padding: 10,
      tilePadding: 12,
      widgets: [
        at(newWidget("photos", "t-photos", { x: 0, y: 0 }), { x: 0, y: 0, w: 12, h: 8 }, {
          intervalSeconds: 20,
          fit: "cover",
          showCaption: true,
        } as Partial<Widget>),
        at(newWidget("clock", "t-clock", { x: 0, y: 0 }), { x: 0, y: 0, w: 3, h: 2 }, {
          showBackground: false,
        } as Partial<Widget>),
        at(newWidget("date", "t-date", { x: 0, y: 0 }), { x: 3, y: 0, w: 2, h: 1 }, {
          showBackground: false,
        } as Partial<Widget>),
      ],
    }),
  },
  {
    id: "calendar-wall",
    name: "Calendar wall",
    description: "Month grid with the week ahead and a clock.",
    build: () => ({
      cols: 12,
      rows: 8,
      gap: 16,
      padding: 14,
      tilePadding: 16,
      widgets: [
        at(newWidget("calendarMonth", "t-month", { x: 0, y: 0 }), { x: 0, y: 0, w: 9, h: 8 }),
        at(newWidget("clock", "t-clock", { x: 0, y: 0 }), { x: 9, y: 0, w: 3, h: 2 }),
        at(newWidget("agenda", "t-agenda", { x: 0, y: 0 }), { x: 9, y: 2, w: 3, h: 6 }, {
          range: "upcoming",
          days: 7,
        } as Partial<Widget>),
      ],
    }),
  },
  {
    id: "simple-day",
    name: "Simple day",
    description: "Big clock, date, weather and a note — easy to read from across the room.",
    build: () => ({
      cols: 12,
      rows: 8,
      gap: 20,
      padding: 18,
      tilePadding: 20,
      widgets: [
        at(newWidget("clock", "t-clock", { x: 0, y: 0 }), { x: 0, y: 0, w: 6, h: 4 }, {
          showSeconds: false,
          style: "digital",
        } as Partial<Widget>),
        at(newWidget("date", "t-date", { x: 0, y: 0 }), { x: 6, y: 0, w: 6, h: 2 }),
        at(newWidget("weather", "t-weather", { x: 0, y: 0 }), { x: 6, y: 2, w: 6, h: 3 }, {
          days: 3,
          showHourly: false,
        } as Partial<Widget>),
        at(newWidget("note", "t-note", { x: 0, y: 0 }), { x: 0, y: 4, w: 6, h: 4 }, {
          text: "Add a family note here.",
          size: "l",
        } as Partial<Widget>),
        at(newWidget("sunTimes", "t-sun", { x: 0, y: 0 }), { x: 6, y: 5, w: 6, h: 3 }),
      ],
    }),
  },
];
