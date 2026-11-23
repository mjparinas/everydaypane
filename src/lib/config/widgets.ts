import type { Widget, WidgetType } from "./schema";

// What the admin panel's widget picker offers, and what a new widget of each type starts with.
// Kept free of zod and React so both the display and the admin can import it.

type Defaults<T extends WidgetType> = Omit<
  Extract<Widget, { type: T }>,
  "id" | "x" | "y" | "w" | "h" | "type" | "title" | "showBackground" | "backgroundOpacity"
>;

interface WidgetInfo<T extends WidgetType> {
  label: string;
  description: string;
  icon: string;
  size: { w: number; h: number };
  minSize: { w: number; h: number };
  defaults: () => Defaults<T>;
  // False when the wall never draws `title` (clock uses Label; photos / radar / earth fill the cell).
  // Melvin, 2026-11-22: Title in settings only when the widget shows it.
  supportsTitle?: boolean;
}

export const WIDGETS: { [T in WidgetType]: WidgetInfo<T> } = {
  clock: {
    label: "Clock",
    description: "The time in any city",
    icon: "🕒",
    size: { w: 3, h: 2 },
    minSize: { w: 2, h: 1 },
    supportsTitle: false,
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
  sunTimes: {
    label: "Sunrise & sunset",
    description: "Today's sunrise, sunset and daylight",
    icon: "🌅",
    size: { w: 3, h: 2 },
    minSize: { w: 2, h: 1 },
    defaults: () => ({ showEmoji: true, showDaylight: true }),
  },
  weather: {
    label: "Weather",
    description: "Now and the week ahead",
    icon: "⛅",
    size: { w: 6, h: 3 },
    minSize: { w: 2, h: 2 },
    defaults: () => ({ days: 7, showCurrent: true, showHourly: false, showUv: true, showPollen: true }),
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
  editQr: {
    label: "Phone edit QR",
    description: "Scan to edit meals, shopping and messages",
    icon: "📱",
    size: { w: 2, h: 3 },
    minSize: { w: 2, h: 2 },
    defaults: () => ({}),
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
    size: { w: 4, h: 5 },
    minSize: { w: 2, h: 2 },
    defaults: () => ({ range: "today", days: 3 }),
  },
  calendarMonth: {
    label: "Month calendar",
    description: "The whole month with events",
    icon: "📆",
    size: { w: 8, h: 6 },
    minSize: { w: 4, h: 4 },
    defaults: () => ({ weekStartsOn: 0, showTitle: true, showWeekends: true, fitTitles: true, scrollWeeks: 3 }),
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
    supportsTitle: false,
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
    size: { w: 4, h: 3 },
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
    size: { w: 4, h: 4 },
    minSize: { w: 2, h: 2 },
    defaults: () => ({ listIds: [], count: 8, showDue: true, allowCheck: true }),
  },
  transit: {
    label: "TransLink",
    description: "Next buses from your stops, live",
    icon: "🚌",
    size: { w: 5, h: 3 },
    minSize: { w: 2, h: 2 },
    defaults: () => ({ stops: [], routes: [], count: 4, walkMinutes: 0 }),
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
    size: { w: 4, h: 3 },
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
  chores: {
    label: "Chore chart",
    description: "The kids' chores for today, ticked off with a tap, and their stars",
    icon: "⭐",
    size: { w: 6, h: 4 },
    minSize: { w: 2, h: 2 },
    defaults: () => ({ personIds: [], showStars: true, allowCheck: true }),
  },
  commute: {
    label: "Commute",
    description: "Drive time with live traffic to work or school",
    icon: "🚗",
    size: { w: 3, h: 2 },
    minSize: { w: 2, h: 1 },
    defaults: () => ({ destinationIds: [], showDistance: false, showArrival: true }),
  },
  radar: {
    label: "Rain radar",
    description: "Environment Canada's radar, the past hour and what's coming",
    icon: "🌧️",
    size: { w: 4, h: 4 },
    minSize: { w: 2, h: 2 },
    supportsTitle: false,
    defaults: () => ({ precip: "rain" as const, zoom: 8, pastMinutes: 60, forecastMinutes: 60, animate: true }),
  },
  timer: {
    label: "Timers",
    description: "Kitchen timers you start with a tap, with a flash and a beep when done",
    icon: "⏲️",
    size: { w: 3, h: 3 },
    minSize: { w: 2, h: 2 },
    defaults: () => ({
      presets: [
        { id: "t1", label: "", emoji: "", seconds: 60 },
        { id: "t3", label: "", emoji: "", seconds: 180 },
        { id: "t5", label: "", emoji: "", seconds: 300 },
        { id: "t10", label: "", emoji: "", seconds: 600 },
        { id: "t15", label: "", emoji: "", seconds: 900 },
        { id: "t30", label: "", emoji: "", seconds: 1800 },
      ],
      sound: true,
      fullScreen: true,
      ringSeconds: 60,
    }),
  },
  pomodoro: {
    label: "Pomodoro",
    description: "Focus and break rounds with a chime between them",
    icon: "🍅",
    size: { w: 3, h: 3 },
    minSize: { w: 2, h: 2 },
    defaults: () => ({
      workMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      rounds: 4,
      autoStart: false,
      sound: true,
      fullScreen: false,
      ringSeconds: 10,
    }),
  },
  ferries: {
    label: "BC Ferries",
    description: "Next sailings and how full they are",
    icon: "⛴️",
    size: { w: 4, h: 3 },
    minSize: { w: 2, h: 2 },
    defaults: () => ({ routes: ["TSASWB" as const], count: 3, showVessel: false }),
  },
  sports: {
    label: "Sports scores",
    description: "Live scores and next games for your teams",
    icon: "🏒",
    size: { w: 4, h: 3 },
    minSize: { w: 2, h: 1 },
    defaults: () => ({ teamIds: [], showLast: true }),
  },
  earth: {
    label: "Earth wind map",
    description: "Animated wind and weather from earth.nullschool.net",
    icon: "🌀",
    size: { w: 6, h: 4 },
    minSize: { w: 2, h: 2 },
    supportsTitle: false,
    // Langley until another place is picked; the widget's settings can copy the dashboard's own location.
    defaults: () => ({
      place: "Langley",
      latitude: 49.1,
      longitude: -122.66,
      zoom: "region" as const,
      overlay: "wind" as const,
      showPlace: true,
      animate: true,
    }),
  },
  shopping: {
    label: "Shopping list",
    description: "Groceries the family adds from their phones, ticked off with a tap",
    icon: "🛒",
    size: { w: 4, h: 4 },
    minSize: { w: 2, h: 2 },
    defaults: () => ({ count: 12, allowCheck: true, showDone: false }),
  },
  presence: {
    label: "Who's home",
    description: "Who is home, from Home Assistant",
    icon: "👨‍👩‍👧",
    size: { w: 3, h: 2 },
    minSize: { w: 2, h: 1 },
    defaults: () => ({ entities: [] }),
  },
  school: {
    label: "School status",
    description: "Open, closed or delayed (Langley SD35 snow days)",
    icon: "🏫",
    size: { w: 3, h: 2 },
    minSize: { w: 2, h: 1 },
    defaults: () => ({ schools: [] }),
  },
};

export const WIDGET_TYPES = Object.keys(WIDGETS) as WidgetType[];

/** Groups for the admin widget picker (Views › Add a widget). */
export const WIDGET_GROUPS: { id: string; label: string; types: WidgetType[] }[] = [
  { id: "time", label: "Time", types: ["clock", "date", "sunTimes", "timer", "pomodoro"] },
  { id: "weather", label: "Weather & map", types: ["weather", "airQuality", "radar", "earth"] },
  { id: "calendar", label: "Calendar", types: ["agenda", "calendarMonth", "countdown", "tasks"] },
  { id: "family", label: "Family", types: ["meals", "shopping", "messages", "chores", "school", "presence"] },
  { id: "home", label: "Home", types: ["haEntity", "camera", "media", "wifiQr", "editQr", "garbage", "commute", "transit", "ferries"] },
  { id: "media", label: "Outside", types: ["photos", "sports", "alerts", "note"] },
];

export function newWidget<T extends WidgetType>(type: T, id: string, at: { x: number; y: number }): Extract<Widget, { type: T }> {
  const info = WIDGETS[type];
  // Clock and date defaults set showBackground false; everything else starts with a panel.
  const showBackground = type === "clock" || type === "date" ? false : true;
  return { id, type, showBackground, ...at, ...info.size, ...info.defaults() } as Extract<Widget, { type: T }>;
}
