import type { WidgetType } from "./config/schema";
import { WIDGET_GROUPS, WIDGETS } from "./config/widgets";

// Marketing /features/ catalogue: every widget type with a real-widget sample PNG under
// public/features/widgets/<type>.png (regenerate with `npm run templates:previews`).

export function widgetSamplePath(type: WidgetType): string {
  return `/features/widgets/${type}.png`;
}

export type FeatureWidgetItem = {
  type: WidgetType;
  name: string;
  blurb: string;
  image: string;
};

export type FeatureWidgetGroup = {
  title: string;
  items: FeatureWidgetItem[];
};

/** Extra marketing lines where the picker description is too short for the features page. */
const FEATURE_BLURBS: Partial<Record<WidgetType, string>> = {
  clock: "Digital, analogue, flip, nixie, word, minimal or neon; any time zone.",
  date: "Today's date in a chosen zone.",
  sunTimes: "Open-Meteo sunrise, sunset and daylight length.",
  weather: "Current, hourly, up to 7 days; Open-Meteo or Environment Canada.",
  airQuality: "AQHI or US AQI.",
  radar: "Environment Canada observed + forecast over a map.",
  wildfires: "BC Wildfire Service fires, burned areas and evacuation areas on a map, nearest fires listed.",
  earth: "earth.nullschool.net centred on your place.",
  windy: "Windy's map on one layer: radar, rain, wind, temperature, clouds, snow or air quality.",
  agenda: "Today or the next 1–14 days from Google, iCal and family events.",
  calendarMonth: "Month or 1–6 weeks, weekends on/off, fit titles, scroll.",
  calendarWeek: "One week in a grid, optional weekends.",
  calendarUpNext: "The next event large, with a short following list.",
  countdown: "Holidays, birthdays and events; yearly ones roll over.",
  tasks: "Google Tasks, Microsoft To Do or Todoist with tap-to-tick.",
  chores: "Kids, morning/afternoon/evening bands, stars, weekly goals, fair rotation.",
  meals: "Breakfast, lunch, dinner for a day or a week.",
  menus: "Nutrislice breakfast and lunch for a day or week.",
  shopping: "Groceries from phones; tap to tick on the wall.",
  messages: "Family notes from phones or the wall.",
  note: "Fixed text from the admin.",
  wifiQr: "Join code, optional password.",
  editQr: "QR to edit meals, shopping and messages with no sign-in.",
  transit: "Live departures from up to six TransLink stops.",
  commute: "Drive times with traffic and leave-by.",
  ferries: "Next sailings and how full they are.",
  garbage: "Township of Langley Recycle Coach zones.",
  school: "Open, closed, delayed or late start.",
  haEntity: "Lights, climate, covers, lock (lock only), Nest, ecobee, SmartThings.",
  camera: "UniFi Protect snapshots on a timer.",
  media: "HA, Spotify or Sonos now-playing controls.",
  presence: "Person and device trackers, read only.",
  photos: "Amazon, Google Photos picks, library uploads and more.",
  sports: "Live score, last result, next game.",
  timer: "Kitchen timers with flash, full-screen alert and beeps.",
  pomodoro: "Focus and break rounds with an optional chime.",
  internet: "Ping, dropped checks and speed tests, measured by the screen itself.",
  alerts: "Alert Ready, weather, roads, quakes, BC Hydro.",
  whiteboard: "Finger draw with colours; the same doodle on every display.",
  packages: "UPS, FedEx, Canada Post and USPS tracking on the wall.",
  tides: "Next highs and lows at a NOAA or Canadian station.",
  tempest: "Backyard WeatherFlow station: temp, wind, rain.",
  ecoflow: "EcoFlow battery level, solar and power in and out, time to full or empty.",
  weatherUnderground: "Personal weather station current conditions.",
  unifi: "Internet uptime, latency and outages from your UniFi gateway.",
  stocks: "Watchlist quotes with daily change.",
  crypto: "Coin prices and 24 h change.",
  fx: "Currency pair rates from the ECB.",
  ynab: "Budget name, accounts and categories.",
  tradingView: "Chart iframe for a symbol.",
  fitbit: "Steps, sleep and resting heart rate today.",
  emailCount: "Gmail inbox unread count.",
  rss: "Headlines from chosen feed URLs.",
  news: "CBC/BBC presets, custom RSS or GNews.",
  dadJoke: "One joke, family-friendly option.",
  quotes: "Short quotations with authors.",
  affirmation: "A calm daily line; kids, calm or courage categories.",
  horoscope: "Playful daily blurb for a zodiac sign.",
  instagram: "Public post embed (not profiles).",
  trello: "Lists and open cards on a board.",
  slack: "Latest messages from channels.",
  youtube: "Video or playlist embed.",
  vimeo: "Video embed.",
  airports: "METAR summary per ICAO code; optional delays.",
  maps: "Map for a place query.",
};

export const FEATURE_WIDGET_GROUPS: FeatureWidgetGroup[] = WIDGET_GROUPS.map((g) => ({
  title: g.label,
  items: g.types.map((type) => ({
    type,
    name: WIDGETS[type].label,
    blurb: FEATURE_BLURBS[type] ?? WIDGETS[type].description,
    image: widgetSamplePath(type),
  })),
}));

export const FEATURE_BEHAVIOURS: { name: string; blurb: string }[] = [
  { name: "Multi-view grid", blurb: "Rows, columns, gap, edge inset and padding inside tiles." },
  { name: "Widgets on photos", blurb: "Photos as backdrop; panels stay readable on top." },
  { name: "Time-of-day schedule", blurb: "Morning to overnight views, themes and dimming." },
  { name: "Screen saver", blurb: "Photos or dark; motion, doorbell and alert wake." },
  { name: "Offline + burn-in", blurb: "Service worker cache and pixel shift." },
  { name: "Live household editor", blurb: "Real wall widgets under a drag overlay; templates when a view is empty." },
];
