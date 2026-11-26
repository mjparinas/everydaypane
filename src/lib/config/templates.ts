import { isFreeWidgetType } from "../plans";
import type { View, Widget, WidgetType } from "./schema";
import { newWidget } from "./widgets";

// Starter layouts for the Views tab (Melvin, 2026-11-22; expanded 2026-11-23 with screenshots and more variety).
// Free templates use only Free-tier widgets; Household ones may use any widget. Preview images are real-widget
// screenshots in public/templates/<id>.png (regenerate with `npm run templates:previews` or the GitHub Action).

export const TEMPLATE_CATEGORIES = ["everyday", "productivity", "family", "holiday", "commute", "media"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  everyday: "Everyday",
  productivity: "Productivity",
  family: "Family",
  holiday: "Holiday",
  commute: "Getting around",
  media: "Photos & media",
};

export interface ViewTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  /** Free templates work on any plan; Household ones need Paid to save. */
  tier: "free" | "paid";
  /** Built-in theme to apply on the new view, or null for the dashboard theme. */
  themeId: string | null;
  /** Static preview under /templates/<id>.png */
  preview: string;
  /** Landscape (12×8) is the kitchen default; portrait (8×12) for tall tablets (Melvin, 2026-11-23). */
  orientation?: "landscape" | "portrait";
  /** Builds a fresh view (caller assigns id / name). */
  build: () => Omit<View, "id" | "name" | "themeId">;
}

function at(widget: Widget, spot: Pick<Widget, "x" | "y" | "w" | "h">, patch: Partial<Widget> = {}): Widget {
  return { ...widget, ...spot, ...patch } as Widget;
}

function w<T extends WidgetType>(type: T, id: string, spot: Pick<Widget, "x" | "y" | "w" | "h">, patch: Partial<Widget> = {}): Widget {
  return at(newWidget(type, id, { x: spot.x, y: spot.y }), spot, patch);
}

const christmas = { id: "christmas", name: "Christmas", date: "2026-12-25", emoji: "🎄", kind: "holiday" as const, yearly: true };
const newYear = { id: "new-year", name: "New Year's Day", date: "2027-01-01", emoji: "🎆", kind: "holiday" as const, yearly: true };
const halloween = { id: "halloween", name: "Halloween", date: "2027-10-31", emoji: "🎃", kind: "holiday" as const, yearly: true };
const canadaDay = { id: "canada-day", name: "Canada Day", date: "2027-07-01", emoji: "🇨🇦", kind: "holiday" as const, yearly: true };
const valentines = { id: "valentines", name: "Valentine's Day", date: "2027-02-14", emoji: "💝", kind: "holiday" as const, yearly: true };
const thanksgiving = {
  id: "thanksgiving",
  name: "Thanksgiving",
  date: "2027-10-11",
  emoji: "🦃",
  kind: "holiday" as const,
  yearly: true,
};

const GRID = { cols: 12, rows: 8, gap: 16, padding: 14, tilePadding: 16 } as const;
const PORTRAIT = { cols: 8, rows: 12, gap: 14, padding: 12, tilePadding: 14 } as const;

export const VIEW_TEMPLATES: ViewTemplate[] = [
  {
    id: "kitchen-glance",
    name: "Kitchen Glance",
    description: "Clock, weather, today's schedule and photos — the everyday kitchen wall.",
    category: "everyday",
    tier: "free",
    themeId: "aurora",
    preview: "/templates/kitchen-glance.png",
    build: () => ({
      ...GRID,
      widgets: [
        w("clock", "t-clock", { x: 0, y: 0, w: 4, h: 2 }),
        w("date", "t-date", { x: 4, y: 0, w: 2, h: 1 }),
        w("airQuality", "t-aq", { x: 4, y: 1, w: 2, h: 1 }),
        w("weather", "t-weather", { x: 6, y: 0, w: 6, h: 3 }),
        w("agenda", "t-agenda", { x: 0, y: 2, w: 4, h: 6 }),
        w("photos", "t-photos", { x: 4, y: 3, w: 5, h: 5 }),
        w("countdown", "t-cd", { x: 9, y: 3, w: 3, h: 5 }, { events: [christmas, newYear], count: 2 }),
      ],
    }),
  },
  {
    id: "photo-frame",
    name: "Photo Frame",
    description: "Photos fill the wall with a small clock and date in the corner.",
    category: "media",
    tier: "free",
    themeId: "mist",
    preview: "/templates/photo-frame.png",
    build: () => ({
      cols: 12,
      rows: 8,
      gap: 12,
      padding: 10,
      tilePadding: 12,
      widgets: [
        w("photos", "t-photos", { x: 0, y: 0, w: 12, h: 8 }, { intervalSeconds: 30, fit: "auto", showCaption: true }),
        w("clock", "t-clock", { x: 0, y: 0, w: 3, h: 2 }, { showBackground: false }),
        w("date", "t-date", { x: 3, y: 0, w: 2, h: 1 }, { showBackground: false }),
      ],
    }),
  },
  {
    id: "calendar-wall",
    name: "Calendar Wall",
    description: "Month grid with the week ahead and a clock.",
    category: "everyday",
    tier: "free",
    themeId: "ink",
    preview: "/templates/calendar-wall.png",
    build: () => ({
      ...GRID,
      widgets: [
        w("calendarMonth", "t-month", { x: 0, y: 0, w: 9, h: 8 }, { scrollWeeks: 6, fitTitles: true }),
        w("clock", "t-clock", { x: 9, y: 0, w: 3, h: 2 }),
        w("agenda", "t-agenda", { x: 9, y: 2, w: 3, h: 6 }, { range: "upcoming", days: 7 }),
      ],
    }),
  },
  {
    id: "simple-day",
    name: "Simple Day",
    description: "Big clock, date, weather and a note — easy to read from across the room.",
    category: "everyday",
    tier: "free",
    themeId: "cedar",
    preview: "/templates/simple-day.png",
    build: () => ({
      cols: 12,
      rows: 8,
      gap: 20,
      padding: 18,
      tilePadding: 20,
      widgets: [
        w("clock", "t-clock", { x: 0, y: 0, w: 6, h: 4 }, { showSeconds: false, style: "digital" }),
        w("date", "t-date", { x: 6, y: 0, w: 6, h: 2 }),
        w("weather", "t-weather", { x: 6, y: 2, w: 6, h: 3 }, { days: 3, showHourly: false }),
        w(
          "note",
          "t-note",
          { x: 0, y: 4, w: 6, h: 4 },
          {
            text: "Today's reminders\n• Library books due\n• Pack swim bag\n• Confirm carpool",
            size: "l",
          },
        ),
        w("sunTimes", "t-sun", { x: 6, y: 5, w: 6, h: 3 }),
      ],
    }),
  },
  {
    id: "morning-brief",
    name: "Morning Brief",
    description: "Weather, sunrise, air quality and today's schedule for the breakfast rush.",
    category: "everyday",
    tier: "free",
    themeId: "aurora",
    preview: "/templates/morning-brief.png",
    build: () => ({
      ...GRID,
      widgets: [
        w("clock", "t-clock", { x: 0, y: 0, w: 4, h: 2 }),
        w("date", "t-date", { x: 4, y: 0, w: 3, h: 1 }),
        w("sunTimes", "t-sun", { x: 4, y: 1, w: 3, h: 2 }),
        w("weather", "t-weather", { x: 7, y: 0, w: 5, h: 3 }, { showHourly: true, days: 3 }),
        w("agenda", "t-agenda", { x: 0, y: 2, w: 4, h: 6 }),
        w("airQuality", "t-aq", { x: 4, y: 3, w: 3, h: 2 }),
        w(
          "note",
          "t-note",
          { x: 4, y: 5, w: 3, h: 3 },
          {
            text: "Morning checklist\n☐ Lunches packed\n☐ Permission slip\n☐ Water bottles",
            size: "m",
          },
        ),
        w("countdown", "t-cd", { x: 7, y: 3, w: 5, h: 5 }, { events: [christmas, halloween, canadaDay], count: 3 }),
      ],
    }),
  },
  {
    id: "dual-city",
    name: "Two Cities",
    description: "Vancouver and Toronto clocks with weather and the day ahead.",
    category: "everyday",
    tier: "free",
    themeId: "ocean",
    preview: "/templates/dual-city.png",
    build: () => ({
      ...GRID,
      widgets: [
        w("clock", "t-van", { x: 0, y: 0, w: 4, h: 3 }, { label: "Vancouver", timeZone: "America/Vancouver" }),
        w("clock", "t-tor", { x: 4, y: 0, w: 4, h: 3 }, { label: "Toronto", timeZone: "America/Toronto" }),
        w("date", "t-date", { x: 8, y: 0, w: 4, h: 1 }),
        w("airQuality", "t-aq", { x: 8, y: 1, w: 4, h: 2 }),
        w("weather", "t-weather", { x: 0, y: 3, w: 7, h: 5 }, { days: 5, showHourly: true }),
        w("agenda", "t-agenda", { x: 7, y: 3, w: 5, h: 5 }),
      ],
    }),
  },
  {
    id: "week-planner",
    name: "Week Planner",
    description: "This week's grid, upcoming events and a countdown strip.",
    category: "everyday",
    tier: "free",
    themeId: "ink",
    preview: "/templates/week-planner.png",
    build: () => ({
      ...GRID,
      widgets: [
        w("calendarWeek", "t-week", { x: 0, y: 0, w: 8, h: 5 }),
        w("clock", "t-clock", { x: 8, y: 0, w: 4, h: 2 }),
        w("date", "t-date", { x: 8, y: 2, w: 4, h: 1 }),
        w("countdown", "t-cd", { x: 8, y: 3, w: 4, h: 2 }, { events: [christmas, newYear], count: 2 }),
        w("agenda", "t-agenda", { x: 0, y: 5, w: 8, h: 3 }, { range: "upcoming", days: 7 }),
        w("calendarUpNext", "t-next", { x: 8, y: 5, w: 4, h: 3 }),
      ],
    }),
  },
  {
    id: "night-clock",
    name: "Night Clock",
    description: "A large clock for late evening, with tomorrow's weather underneath.",
    category: "everyday",
    tier: "free",
    themeId: "mono",
    preview: "/templates/night-clock.png",
    build: () => ({
      cols: 12,
      rows: 8,
      gap: 16,
      padding: 20,
      tilePadding: 16,
      widgets: [
        w("clock", "t-clock", { x: 0, y: 0, w: 12, h: 5 }, { label: "", showSeconds: true }),
        w("date", "t-date", { x: 0, y: 5, w: 4, h: 1 }),
        w("weather", "t-weather", { x: 0, y: 6, w: 6, h: 2 }, { days: 3, showHourly: false }),
        w("wifiQr", "t-wifi", { x: 6, y: 5, w: 3, h: 3 }),
        w(
          "note",
          "t-note",
          { x: 9, y: 5, w: 3, h: 3 },
          {
            text: "Good night\nPhones charging\nDoors locked\nAlarm 6:45",
            size: "m",
          },
        ),
      ],
    }),
  },
  {
    id: "focus-desk",
    name: "Focus Desk",
    description: "Pomodoro, to-dos and a quiet clock — deep work on the wall.",
    category: "productivity",
    tier: "paid",
    themeId: "ink",
    preview: "/templates/focus-desk.png",
    build: () => ({
      ...GRID,
      widgets: [
        w("pomodoro", "t-pomo", { x: 0, y: 0, w: 4, h: 4 }),
        w("clock", "t-clock", { x: 4, y: 0, w: 4, h: 2 }),
        w("date", "t-date", { x: 8, y: 0, w: 4, h: 1 }),
        w("quotes", "t-quote", { x: 8, y: 1, w: 4, h: 2 }),
        w("tasks", "t-tasks", { x: 4, y: 2, w: 4, h: 6 }, { count: 10, allowCheck: true }),
        w(
          "note",
          "t-note",
          { x: 0, y: 4, w: 4, h: 4 },
          {
            text: "Today's focus\n1. Finish budget draft\n2. Book dentist\n3. Inbox to zero",
            size: "m",
          },
        ),
        w("agenda", "t-agenda", { x: 8, y: 3, w: 4, h: 5 }),
      ],
    }),
  },
  {
    id: "kitchen-command",
    name: "Kitchen Command",
    description: "Meals, shopping list, timers and today's schedule for cooking.",
    category: "family",
    tier: "paid",
    themeId: "cedar",
    preview: "/templates/kitchen-command.png",
    build: () => ({
      ...GRID,
      widgets: [
        w("clock", "t-clock", { x: 0, y: 0, w: 3, h: 2 }),
        w("weather", "t-weather", { x: 3, y: 0, w: 5, h: 2 }, { days: 0, showHourly: false }),
        w("timer", "t-timer", { x: 8, y: 0, w: 4, h: 3 }),
        w("meals", "t-meals", { x: 0, y: 2, w: 4, h: 3 }, { days: 1 }),
        w("shopping", "t-shop", { x: 4, y: 2, w: 4, h: 6 }, { count: 12, allowCheck: true }),
        w("agenda", "t-agenda", { x: 0, y: 5, w: 4, h: 3 }),
        w("garbage", "t-garbage", { x: 8, y: 3, w: 4, h: 2 }),
        w("messages", "t-msg", { x: 8, y: 5, w: 4, h: 3 }),
      ],
    }),
  },
  {
    id: "family-hub",
    name: "Family Hub",
    description: "Chores, school status, meals and the message board.",
    category: "family",
    tier: "paid",
    themeId: "forest",
    preview: "/templates/family-hub.png",
    build: () => ({
      ...GRID,
      widgets: [
        w("clock", "t-clock", { x: 0, y: 0, w: 3, h: 2 }),
        w("school", "t-school", { x: 3, y: 0, w: 3, h: 2 }),
        w("weather", "t-weather", { x: 6, y: 0, w: 6, h: 2 }, { days: 0, showHourly: false }),
        w("chores", "t-chores", { x: 0, y: 2, w: 6, h: 4 }, { allowCheck: true, showStars: true }),
        w("meals", "t-meals", { x: 6, y: 2, w: 3, h: 3 }, { days: 1 }),
        w("presence", "t-home", { x: 9, y: 2, w: 3, h: 3 }),
        w("messages", "t-msg", { x: 0, y: 6, w: 6, h: 2 }),
        w("photos", "t-photos", { x: 6, y: 5, w: 6, h: 3 }),
      ],
    }),
  },
  {
    id: "kids-routine",
    name: "Kids Routine",
    description: "Chores, school, timers and tonight's dinner for the after-school rush.",
    category: "family",
    tier: "paid",
    themeId: "sunset",
    preview: "/templates/kids-routine.png",
    build: () => ({
      ...GRID,
      widgets: [
        w("clock", "t-clock", { x: 0, y: 0, w: 3, h: 2 }),
        w("date", "t-date", { x: 3, y: 0, w: 3, h: 1 }),
        w("school", "t-school", { x: 3, y: 1, w: 3, h: 1 }),
        w("timer", "t-timer", { x: 6, y: 0, w: 3, h: 3 }),
        w("weather", "t-weather", { x: 9, y: 0, w: 3, h: 3 }, { days: 0, showHourly: false }),
        w("chores", "t-chores", { x: 0, y: 2, w: 6, h: 4 }),
        w("meals", "t-meals", { x: 6, y: 3, w: 6, h: 3 }),
        w("messages", "t-msg", { x: 0, y: 6, w: 6, h: 2 }),
        w("agenda", "t-agenda", { x: 6, y: 6, w: 6, h: 2 }),
      ],
    }),
  },
  {
    id: "commute-dash",
    name: "Commute Dash",
    description: "Buses, drive times and weather before you leave the house.",
    category: "commute",
    tier: "paid",
    themeId: "ocean",
    preview: "/templates/commute-dash.png",
    build: () => ({
      ...GRID,
      widgets: [
        w("clock", "t-clock", { x: 0, y: 0, w: 3, h: 2 }),
        w("weather", "t-weather", { x: 3, y: 0, w: 5, h: 2 }, { showHourly: true, days: 0 }),
        w("commute", "t-drive", { x: 8, y: 0, w: 4, h: 2 }),
        w("transit", "t-bus", { x: 0, y: 2, w: 5, h: 4 }),
        w("agenda", "t-agenda", { x: 5, y: 2, w: 3, h: 6 }),
        w("radar", "t-radar", { x: 8, y: 2, w: 4, h: 6 }),
        w("airQuality", "t-aq", { x: 0, y: 6, w: 5, h: 2 }),
      ],
    }),
  },
  {
    id: "ferry-weekend",
    name: "Ferry Weekend",
    description: "BC Ferries sailings, tides and the weekend forecast.",
    category: "commute",
    tier: "paid",
    themeId: "ocean",
    preview: "/templates/ferry-weekend.png",
    build: () => ({
      ...GRID,
      widgets: [
        w("clock", "t-clock", { x: 0, y: 0, w: 3, h: 2 }),
        w("weather", "t-weather", { x: 3, y: 0, w: 5, h: 2 }, { days: 5 }),
        w("tides", "t-tides", { x: 8, y: 0, w: 4, h: 2 }),
        w("ferries", "t-ferry", { x: 0, y: 2, w: 7, h: 4 }, { routes: ["TSASWB", "HSBLNG"], count: 4 }),
        w("agenda", "t-agenda", { x: 7, y: 2, w: 5, h: 4 }, { range: "upcoming", days: 3 }),
        w("sunTimes", "t-sun", { x: 0, y: 6, w: 4, h: 2 }),
        w(
          "note",
          "t-note",
          { x: 4, y: 6, w: 8, h: 2 },
          {
            text: "Ferry day: snacks, cards, layers, and leave 90 min before sailing.",
            size: "s",
          },
        ),
      ],
    }),
  },
  {
    id: "christmas",
    name: "Christmas",
    description: "Countdowns, festive photos, meals and December's calendar.",
    category: "holiday",
    tier: "paid",
    themeId: "forest",
    preview: "/templates/christmas.png",
    build: () => ({
      ...GRID,
      widgets: [
        w("photos", "t-photos", { x: 0, y: 0, w: 12, h: 8 }, { fit: "cover", intervalSeconds: 20 }),
        w("clock", "t-clock", { x: 0, y: 0, w: 3, h: 2 }, { showBackground: false }),
        w(
          "countdown",
          "t-cd",
          { x: 3, y: 0, w: 4, h: 3 },
          {
            events: [christmas, newYear],
            count: 2,
            showBackground: true,
            backgroundOpacity: 0.85,
          },
        ),
        w(
          "note",
          "t-note",
          { x: 7, y: 0, w: 5, h: 2 },
          {
            text: "🎄 Merry Christmas!\nHam in at 2 · presents after dinner · cocoa at 8",
            size: "m",
            backgroundOpacity: 0.85,
          },
        ),
        w("meals", "t-meals", { x: 0, y: 5, w: 4, h: 3 }, { days: 1, backgroundOpacity: 0.9 }),
        w("agenda", "t-agenda", { x: 4, y: 5, w: 4, h: 3 }, { backgroundOpacity: 0.9 }),
        w("calendarMonth", "t-month", { x: 8, y: 2, w: 4, h: 6 }, { backgroundOpacity: 0.9, scrollWeeks: 6 }),
      ],
    }),
  },
  {
    id: "halloween",
    name: "Halloween",
    description: "Pumpkin countdown, spooky photos and the night's plans.",
    category: "holiday",
    tier: "paid",
    themeId: "sunset",
    preview: "/templates/halloween.png",
    build: () => ({
      ...GRID,
      widgets: [
        w("photos", "t-photos", { x: 0, y: 0, w: 12, h: 8 }, { fit: "cover" }),
        w(
          "countdown",
          "t-cd",
          { x: 0, y: 0, w: 4, h: 3 },
          {
            events: [halloween, thanksgiving],
            count: 2,
            backgroundOpacity: 0.88,
          },
        ),
        w("clock", "t-clock", { x: 8, y: 0, w: 4, h: 2 }, { showBackground: false }),
        w(
          "note",
          "t-note",
          { x: 4, y: 0, w: 4, h: 2 },
          {
            text: "🎃 Trick-or-treat 5:30–8\nRoute on the fridge · glow sticks by the door",
            size: "m",
            backgroundOpacity: 0.88,
          },
        ),
        w("agenda", "t-agenda", { x: 0, y: 5, w: 5, h: 3 }, { backgroundOpacity: 0.9 }),
        w("weather", "t-weather", { x: 5, y: 5, w: 4, h: 3 }, { days: 0, showHourly: false, backgroundOpacity: 0.9 }),
        w("messages", "t-msg", { x: 9, y: 5, w: 3, h: 3 }, { backgroundOpacity: 0.9 }),
      ],
    }),
  },
  {
    id: "new-year",
    name: "New Year",
    description: "Countdown to midnight, resolutions and a fresh calendar.",
    category: "holiday",
    tier: "paid",
    themeId: "aurora",
    preview: "/templates/new-year.png",
    build: () => ({
      ...GRID,
      widgets: [
        w("countdown", "t-cd", { x: 0, y: 0, w: 5, h: 3 }, { events: [newYear, valentines], count: 2 }),
        w("clock", "t-clock", { x: 5, y: 0, w: 4, h: 3 }),
        w("date", "t-date", { x: 9, y: 0, w: 3, h: 1 }),
        w(
          "note",
          "t-note",
          { x: 9, y: 1, w: 3, h: 2 },
          {
            text: "Resolutions\n• Family hike monthly\n• Cook Sundays\n• Phones away at dinner",
            size: "s",
          },
        ),
        w("calendarMonth", "t-month", { x: 5, y: 3, w: 7, h: 5 }, { scrollWeeks: 6 }),
        w("tasks", "t-tasks", { x: 0, y: 3, w: 5, h: 5 }, { count: 8 }),
      ],
    }),
  },
  {
    id: "rainy-day",
    name: "Rainy Day",
    description: "Animated radar, forecast and air quality when the weather turns.",
    category: "everyday",
    tier: "paid",
    themeId: "mist",
    preview: "/templates/rainy-day.png",
    build: () => ({
      ...GRID,
      widgets: [
        w("radar", "t-radar", { x: 0, y: 0, w: 6, h: 6 }),
        w("weather", "t-weather", { x: 6, y: 0, w: 6, h: 4 }, { days: 5, showHourly: true }),
        w("clock", "t-clock", { x: 0, y: 6, w: 3, h: 2 }),
        w("sunTimes", "t-sun", { x: 3, y: 6, w: 3, h: 2 }),
        w("airQuality", "t-aq", { x: 6, y: 4, w: 3, h: 2 }),
        w("earth", "t-earth", { x: 9, y: 4, w: 3, h: 4 }, { zoom: "region", overlay: "precip_3hr" }),
        w(
          "note",
          "t-note",
          { x: 6, y: 6, w: 3, h: 2 },
          {
            text: "Rain plan\nUmbrellas by door\nBoots in the porch",
            size: "s",
          },
        ),
      ],
    }),
  },
  {
    id: "sports-lounge",
    name: "Sports Lounge",
    description: "Live scores, music and photos for game night.",
    category: "media",
    tier: "paid",
    themeId: "sunset",
    preview: "/templates/sports-lounge.png",
    build: () => ({
      ...GRID,
      widgets: [
        w("sports", "t-sports", { x: 0, y: 0, w: 5, h: 4 }),
        w("media", "t-music", { x: 5, y: 0, w: 4, h: 3 }),
        w("clock", "t-clock", { x: 9, y: 0, w: 3, h: 2 }),
        w("weather", "t-weather", { x: 9, y: 2, w: 3, h: 2 }, { days: 0, showHourly: false }),
        w("photos", "t-photos", { x: 5, y: 3, w: 4, h: 5 }),
        w("agenda", "t-agenda", { x: 0, y: 4, w: 5, h: 4 }),
        w("messages", "t-msg", { x: 9, y: 4, w: 3, h: 4 }),
      ],
    }),
  },
  {
    id: "smart-home",
    name: "Smart Home",
    description: "Who's home, a camera glance and a few house controls.",
    category: "everyday",
    tier: "paid",
    themeId: "mono",
    preview: "/templates/smart-home.png",
    build: () => ({
      ...GRID,
      widgets: [
        w("clock", "t-clock", { x: 0, y: 0, w: 3, h: 2 }),
        w("presence", "t-home", { x: 3, y: 0, w: 3, h: 2 }),
        w("camera", "t-cam", { x: 6, y: 0, w: 6, h: 4 }),
        w("haEntity", "t-light", { x: 0, y: 2, w: 3, h: 2 }, { control: "light", title: "Kitchen" }),
        w("haEntity", "t-climate", { x: 3, y: 2, w: 3, h: 2 }, { control: "climate", title: "Thermostat" }),
        w("weather", "t-weather", { x: 0, y: 4, w: 6, h: 2 }, { days: 0 }),
        w("media", "t-music", { x: 0, y: 6, w: 6, h: 2 }),
        w("alerts", "t-alerts", { x: 6, y: 4, w: 6, h: 2 }),
        w("agenda", "t-agenda", { x: 6, y: 6, w: 6, h: 2 }),
      ],
    }),
  },
  {
    id: "family-hub-portrait",
    name: "Family Hub (Portrait)",
    description: "Tall twin of Family hub for a hallway tablet or fridge panel.",
    category: "family",
    tier: "paid",
    themeId: "forest",
    preview: "/templates/family-hub-portrait.png",
    orientation: "portrait",
    build: () => ({
      ...PORTRAIT,
      widgets: [
        w("clock", "t-clock", { x: 0, y: 0, w: 4, h: 2 }),
        w("school", "t-school", { x: 4, y: 0, w: 4, h: 2 }),
        w("weather", "t-weather", { x: 0, y: 2, w: 8, h: 2 }, { days: 0, showHourly: false }),
        w("chores", "t-chores", { x: 0, y: 4, w: 8, h: 4 }, { allowCheck: true, showStars: true, layout: "byPeriod" }),
        w("meals", "t-meals", { x: 0, y: 8, w: 4, h: 2 }, { days: 1 }),
        w("messages", "t-msg", { x: 4, y: 8, w: 4, h: 2 }),
        w("photos", "t-photos", { x: 0, y: 10, w: 8, h: 2 }),
      ],
    }),
  },
  {
    id: "kids-routine-portrait",
    name: "Kids Routine (Portrait)",
    description: "Tall twin of Kids routine — chores first, dinner and agenda below.",
    category: "family",
    tier: "paid",
    themeId: "sunset",
    preview: "/templates/kids-routine-portrait.png",
    orientation: "portrait",
    build: () => ({
      ...PORTRAIT,
      widgets: [
        w("clock", "t-clock", { x: 0, y: 0, w: 8, h: 2 }, { style: "flip" }),
        w("school", "t-school", { x: 0, y: 2, w: 4, h: 1 }),
        w("date", "t-date", { x: 4, y: 2, w: 4, h: 1 }),
        w("chores", "t-chores", { x: 0, y: 3, w: 8, h: 5 }, { allowCheck: true, showStars: true, layout: "byPeriod" }),
        w("meals", "t-meals", { x: 0, y: 8, w: 8, h: 2 }, { days: 1 }),
        w("timer", "t-timer", { x: 0, y: 10, w: 4, h: 2 }),
        w("agenda", "t-agenda", { x: 4, y: 10, w: 4, h: 2 }),
      ],
    }),
  },
  {
    id: "playroom-portrait",
    name: "Playroom (Portrait)",
    description: "Word clock, chore bands and a joke — a tall kids corner.",
    category: "family",
    tier: "paid",
    themeId: "sunset",
    preview: "/templates/playroom-portrait.png",
    orientation: "portrait",
    build: () => ({
      ...PORTRAIT,
      widgets: [
        w("clock", "t-clock", { x: 0, y: 0, w: 8, h: 3 }, { style: "word", showSeconds: false }),
        w("chores", "t-chores", { x: 0, y: 3, w: 8, h: 5 }, { allowCheck: true, showStars: true, layout: "byPeriod" }),
        w("dadJoke", "t-joke", { x: 0, y: 8, w: 8, h: 2 }),
        w("messages", "t-msg", { x: 0, y: 10, w: 8, h: 2 }, { allowAdd: false }),
      ],
    }),
  },
];

/** Whether every widget in a template is allowed on Free. */
export function templateIsFree(t: ViewTemplate): boolean {
  if (t.tier === "paid") return false;
  return t.build().widgets.every((widget) => isFreeWidgetType(widget.type));
}
