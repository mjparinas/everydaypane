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
  sunTimes: "Open-Meteo sunrise, sunset and daylight length, plus tonight's moon.",
  moon: "Tonight's phase, how much is lit and the next full moon by its traditional name.",
  aurora: "NOAA's Kp forecast and the chance of seeing the northern lights from home tonight.",
  weather: "Current, hourly, up to 7 days; Open-Meteo or Environment Canada.",
  airQuality: "AQHI or US AQI.",
  airthings: "Indoor radon, CO₂, VOC and particles from Airthings.",
  laundry: "Washer and dryer time left and done, from LG ThinQ or Samsung SmartThings.",
  blueRiiot: "Pool water temperature, pH, ORP and salinity from a Blue Riiot Blue Connect.",
  snow: "New snow, base depth and the next days' snowfall for Cypress, Grouse, Seymour, Whistler and more.",
  radar: "Environment Canada observed + forecast over a map.",
  rivers: "Fraser River and creek levels from Environment Canada gauges, rising or falling, with a day's line.",
  wildfires: "BC Wildfire Service fires, burned areas and evacuation areas on a map, nearest fires listed.",
  earth: "earth.nullschool.net centred on your place.",
  windy: "Windy's map on one layer: radar, rain, wind, temperature, clouds, snow or air quality.",
  agenda: "Today or the next 1–14 days from Google, iCal and family events.",
  calendarMonth: "Month or 1–6 weeks, weekends on/off, fit titles, scroll.",
  calendarWeek: "One week in a grid, optional weekends.",
  calendarUpNext: "The next event large, with a short following list.",
  countdown: "Birthdays, anniversaries and holidays with a photo each; the age or the years, and a celebration on the day.",
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
  drivebc: "DriveBC highway camera pictures, refreshed on a timer.",
  borderWait: "Car waits at Peace Arch, Pacific Highway, Aldergrove and more, into the U.S. and into Canada.",
  gasPrices: "The cheapest regular, premium or diesel near home, from Google Maps.",
  garbage: "Township of Langley Recycle Coach zones.",
  school: "Open, closed, delayed or late start.",
  schoolDays: "School today or not, Pro-D days, breaks and summer counted down, with the weekly hot-lunch day. Langley 2026–27 in one tap.",
  haEntity:
    "Lights, climate, covers, lock (lock only), Nest, ecobee, SmartThings, Govee colour lights and scenes, Philips Hue and LIFX lights.",
  camera: "UniFi Protect snapshots on a timer.",
  media: "HA, Spotify or Sonos now-playing controls.",
  presence: "Person and device trackers, read only.",
  photos: "A photo frame: portrait pairs, On this day, and photos the family adds from their phones.",
  sports: "Live score, last result, next game.",
  timer: "Kitchen timers with flash, full-screen alert and beeps.",
  pomodoro: "Focus and break rounds with an optional chime.",
  internet: "Ping, dropped checks and speed tests, measured by the screen itself.",
  alerts: "Weather warnings, roads, quakes, power outages and evacuations for your region.",
  whiteboard: "Finger draw with colours; the same doodle on every display.",
  packages: "Today's deliveries and what's on its way, from Canada Post, Purolator, UPS, FedEx and more.",
  tides: "Next highs and lows and the day's tide curve at a Canadian or NOAA station.",
  tempest: "Backyard WeatherFlow station: temp, wind, rain.",
  rachio: "The next Rachio sprinkler watering, its zones and length, with a Skip button.",
  ecoflow: "EcoFlow battery level, solar and power in and out, time to full or empty.",
  weatherUnderground: "Personal weather station current conditions.",
  unifi: "Internet uptime, latency and outages from your UniFi gateway.",
  stocks: "Watchlist quotes with daily change.",
  crypto: "Coin prices and 24 h change.",
  fx: "Currency pair rates from the ECB.",
  ynab: "Budget name, accounts and categories.",
  tradingView: "Chart iframe for a symbol.",
  fitbit: "Steps, sleep and resting heart rate today.",
  oura: "Last night's sleep, readiness and activity scores from an Oura ring.",
  emailCount: "Gmail inbox unread count.",
  rss: "Headlines from chosen feed URLs.",
  news: "CBC/BBC presets, custom RSS or GNews.",
  dadJoke: "One joke, family-friendly option.",
  quotes: "Short quotations with authors.",
  affirmation: "A calm daily line; kids, calm or courage categories.",
  onThisDay: "A family-friendly moment from history, from Wikipedia.",
  brief: "The day in one sentence: rain at 3, ferry delays, garbage out tonight, the dentist at 4.",
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

/**
 * A display behaviour card on /features/. `image` is a real wall screenshot (width and height in pixels) from
 * `npm run templates:previews`, except the live editor's, which `node scripts/feature-editor-preview.mjs` takes from a
 * production build. `wide` cards span both columns and show the picture at its own shape; the others sit in pairs in a
 * 2:1 frame.
 */
export type FeatureBehaviour = { name: string; blurb: string; image?: string; width?: number; height?: number; wide?: boolean };

// Every card has a picture (Melvin, 2026-11-27: "can you add screenshots to these"). Names are headings, so Title Case.
export const FEATURE_BEHAVIOURS: FeatureBehaviour[] = [
  // Smart notices and regional packs (Melvin, 2026-11-26: "add smart notices and regional packs").
  {
    name: "Smart Notices",
    blurb:
      "Blue notes that put two things together: sprinklers due in frost or rain, the backup battery left in a power cut, smoky air outside with the reading indoors, a pool freeze, laundry left in the machine, bins out tonight.",
    image: "/features/smart-notices.png",
    width: 1280,
    height: 640,
    wide: true,
  },
  {
    name: "Regional Packs",
    blurb:
      "Your location picks the sources: Alert Ready, BC Hydro and DriveBC in B.C., Hydro-Québec in Québec, the National Weather Service and USGS in the U.S., and live transit from TransLink, the TTC, Calgary, Edmonton, Halifax or King County Metro.",
    image: "/features/regional-packs.png",
    width: 1600,
    height: 880,
  },
  {
    name: "Multi-View Grid",
    blurb: "Rows, columns, gap, edge inset and padding inside tiles.",
    image: "/features/multi-view-grid.png",
    width: 1920,
    height: 960,
  },
  {
    name: "Widgets on Photos",
    blurb: "Photos as backdrop; panels stay readable on top.",
    image: "/features/widgets-on-photos.png",
    width: 1920,
    height: 960,
  },
  {
    name: "Offline + Burn-In",
    blurb: "Service worker cache and pixel shift.",
    image: "/features/offline-burn-in.png",
    width: 1920,
    height: 960,
  },
  {
    name: "Time-of-Day Schedule",
    blurb: "Morning to overnight views, themes and dimming.",
    image: "/features/time-of-day.png",
    width: 1920,
    height: 1200,
    wide: true,
  },
  {
    name: "Screen Saver",
    blurb: "A photo frame view, photos or dark when idle; a tap wakes it.",
    image: "/features/screen-saver.png",
    width: 1920,
    height: 620,
    wide: true,
  },
  {
    name: "Live Household Editor",
    blurb: "Real wall widgets under a drag overlay; templates when a view is empty.",
    image: "/features/live-editor.png",
    width: 1600,
    height: 960,
    wide: true,
  },
];
