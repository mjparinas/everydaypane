import type { Widget, WidgetType } from "./schema";

// What the admin panel's widget picker offers, and what a new widget of each type starts with.
// Kept free of zod and React so both the display and the admin can import it.

type Defaults<T extends WidgetType> = Omit<Extract<Widget, { type: T }>, "id" | "x" | "y" | "w" | "h" | "type" | "title">;

interface WidgetInfo<T extends WidgetType> {
  label: string;
  description: string;
  icon: string;
  size: { w: number; h: number };
  minSize: { w: number; h: number };
  defaults: () => Defaults<T>;
}

export const WIDGETS: { [T in WidgetType]: WidgetInfo<T> } = {
  clock: {
    label: "Clock",
    description: "The time in any city",
    icon: "🕒",
    size: { w: 3, h: 2 },
    minSize: { w: 2, h: 1 },
    defaults: () => ({ timeZone: "America/Vancouver", label: "Vancouver", showSeconds: false, style: "digital" }),
  },
  date: {
    label: "Date",
    description: "Today's date",
    icon: "📅",
    size: { w: 3, h: 1 },
    minSize: { w: 2, h: 1 },
    defaults: () => ({ timeZone: "America/Vancouver", showYear: false }),
  },
  weather: {
    label: "Weather",
    description: "Now and the week ahead",
    icon: "⛅",
    size: { w: 6, h: 3 },
    minSize: { w: 2, h: 2 },
    defaults: () => ({ days: 7, showCurrent: true, showHourly: false }),
  },
  airQuality: {
    label: "Air quality",
    description: "AQHI (Canada) or US AQI",
    icon: "🌬️",
    size: { w: 3, h: 2 },
    minSize: { w: 2, h: 1 },
    defaults: () => ({ scale: "aqhi" }),
  },
  wifiQr: {
    label: "WiFi QR code",
    description: "Guests scan to join",
    icon: "📶",
    size: { w: 2, h: 3 },
    minSize: { w: 2, h: 2 },
    defaults: () => ({ ssid: "Home", password: "", encryption: "WPA", hidden: false, showPassword: false }),
  },
  countdown: {
    label: "Countdown",
    description: "Days until holidays and birthdays",
    icon: "🎉",
    size: { w: 3, h: 3 },
    minSize: { w: 2, h: 1 },
    defaults: () => ({ events: [], count: 4 }),
  },
  agenda: {
    label: "Schedule",
    description: "Today's events from Google Calendar",
    icon: "🗓️",
    size: { w: 4, h: 4 },
    minSize: { w: 2, h: 2 },
    defaults: () => ({ range: "today", days: 3 }),
  },
  calendarMonth: {
    label: "Month calendar",
    description: "The whole month with events",
    icon: "📆",
    size: { w: 8, h: 6 },
    minSize: { w: 4, h: 4 },
    defaults: () => ({ weekStartsOn: 0, showTitle: true }),
  },
  garbage: {
    label: "Garbage day",
    description: "Next pickups from your collection calendar",
    icon: "🗑️",
    size: { w: 3, h: 2 },
    minSize: { w: 2, h: 1 },
    defaults: () => ({ weeks: 2 }),
  },
  photos: {
    label: "Photos",
    description: "A slideshow from Amazon Photos or links",
    icon: "🖼️",
    size: { w: 6, h: 5 },
    minSize: { w: 2, h: 2 },
    defaults: () => ({ sourceIds: [], intervalSeconds: 30, fit: "cover", showCaption: false }),
  },
  haEntity: {
    label: "Home Assistant",
    description: "Lights, switches, sensors and more",
    icon: "🏠",
    size: { w: 2, h: 2 },
    minSize: { w: 1, h: 1 },
    defaults: () => ({ entityId: "", control: "auto" }),
  },
  note: {
    label: "Note",
    description: "A message for the family",
    icon: "📝",
    size: { w: 3, h: 2 },
    minSize: { w: 1, h: 1 },
    defaults: () => ({ text: "Have a great day!", size: "m" }),
  },
  messages: {
    label: "Message board",
    description: "Notes the family posts from their phones",
    icon: "💬",
    size: { w: 3, h: 3 },
    minSize: { w: 2, h: 2 },
    defaults: () => ({ count: 5 }),
  },
  meals: {
    label: "Meals",
    description: "Breakfast, lunch and dinner from the meal plan",
    icon: "🍽️",
    size: { w: 3, h: 3 },
    minSize: { w: 2, h: 1 },
    defaults: () => ({ days: 1, slots: ["breakfast", "lunch", "dinner"] }),
  },
  alerts: {
    label: "Alerts",
    description: "Emergency, weather, road and earthquake alerts",
    icon: "🚨",
    size: { w: 4, h: 2 },
    minSize: { w: 2, h: 1 },
    defaults: () => ({ showAllClear: true }),
  },
  tasks: {
    label: "Tasks",
    description: "To-do lists from Google Tasks",
    icon: "✅",
    size: { w: 3, h: 4 },
    minSize: { w: 2, h: 2 },
    defaults: () => ({ listIds: [], count: 8, showDue: true, allowCheck: true }),
  },
  camera: {
    label: "Camera",
    description: "A UniFi Protect camera via Home Assistant",
    icon: "📹",
    size: { w: 4, h: 3 },
    minSize: { w: 2, h: 2 },
    defaults: () => ({ entityId: "", refreshSeconds: 10 }),
  },
  media: {
    label: "Music",
    description: "Spotify or Sonos, directly or via Home Assistant",
    icon: "🎵",
    size: { w: 4, h: 2 },
    minSize: { w: 2, h: 2 },
    defaults: () => ({
      provider: "homeAssistant" as const,
      entityId: "",
      playerId: "",
      showArt: true,
      showVolume: true,
      showSources: false,
    }),
  },
  commute: {
    label: "Commute",
    description: "Drive time with live traffic to work or school",
    icon: "🚗",
    size: { w: 3, h: 2 },
    minSize: { w: 2, h: 1 },
    defaults: () => ({ destinationIds: [], showDistance: false, showArrival: true }),
  },
  ferries: {
    label: "BC Ferries",
    description: "Next sailings and how full they are",
    icon: "⛴️",
    size: { w: 4, h: 3 },
    minSize: { w: 2, h: 2 },
    defaults: () => ({ routes: ["TSASWB" as const], count: 3, showVessel: false }),
  },
};

export const WIDGET_TYPES = Object.keys(WIDGETS) as WidgetType[];

export function newWidget<T extends WidgetType>(type: T, id: string, at: { x: number; y: number }): Extract<Widget, { type: T }> {
  const info = WIDGETS[type];
  return { id, type, ...at, ...info.size, ...info.defaults() } as Extract<Widget, { type: T }>;
}
