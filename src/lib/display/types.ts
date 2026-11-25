import type { DashboardConfig, Theme, View } from "@/lib/config/schema";

// What a display receives: the parts of the settings document it needs, nothing secret. Built by
// src/lib/display/payload.ts, read by src/display/. Types only, so the display bundle carries no schema code.

export interface DisplayPayload {
  version: number;
  device: { id: string; name: string } | null; // null: an admin's preview
  name: string;
  location: { name: string; timeZone: string };
  units: DashboardConfig["units"];
  hour12: boolean;
  themes: Record<string, Theme>;
  themeId: string;
  views: View[];
  /** The one view this device shows, or null to follow the schedule. */
  fixedViewId: string | null;
  schedule: DashboardConfig["schedule"];
  burnIn: DashboardConfig["burnIn"];
  alerts: Pick<DashboardConfig["alerts"], "enabled" | "banner">;
  doorbell: { enabled: boolean; seconds: number; entityId: string; cameraEntityId: string };
  screenSaver: DashboardConfig["screenSaver"];
  /** Household plans watch for settings changes; Free keeps the 30-second poll only. */
  instantRefresh: boolean;
}

export interface WeatherDay {
  date: string;
  code: number;
  max: number;
  min: number;
  precip: number; // chance, %
}

export interface WeatherHour {
  time: string; // local ISO, e.g. 2026-11-17T14:00
  temp: number;
  code: number;
  precip: number;
  isDay: boolean;
}

export interface WeatherData {
  updatedAt: number;
  units: { temp: "°C" | "°F"; wind: "km/h" | "mph" };
  current: {
    temp: number;
    feels: number;
    code: number;
    isDay: boolean;
    wind: number;
    humidity: number;
    /** UV index now, when Open-Meteo sent one. */
    uv?: number;
  };
  today: { sunrise: string; sunset: string; /** Today's peak UV, when known. */ uvMax?: number };
  /** Highest pollen grains/m³ among the kinds Open-Meteo reports (often absent in North America). */
  pollen?: number;
  hours: WeatherHour[];
  days: WeatherDay[];
}

export interface AirData {
  updatedAt: number;
  aqhi: number;
  usAqi: number;
  pm25: number;
}

/** A note on the family message board, as a display gets it (no emails). */
export interface BoardMessage {
  id: string;
  author: string;
  text: string;
  colour: "yellow" | "pink" | "blue" | "green" | "purple";
  pinned: boolean;
  createdAt: number;
}

/** A Google Calendar event, trimmed by the server (src/server/google.ts). */
export interface CalendarEvent {
  id: string;
  title: string;
  /** An ISO date-time with its offset, or a YYYY-MM-DD date for all-day events. */
  start: string;
  /** Exclusive: an all-day event on the 17th ends on the 18th, as Google sends it. */
  end: string;
  allDay: boolean;
  color: string;
  calendar: string;
  location?: string;
}

export interface CalendarData {
  updatedAt: number;
  /** The days covered (local dates, inclusive of from, exclusive of to). */
  from: string;
  to: string;
  events: CalendarEvent[];
  /** False until an admin connects Google in the admin panel. */
  connected?: boolean;
}

/** One open Google Task, trimmed by the server (src/server/googleTasks.ts). */
export interface TaskItem {
  id: string;
  title: string;
  /** YYYY-MM-DD (Google keeps only the date of a task's due time). */
  due?: string;
  /** A subtask: drawn indented under its parent. */
  sub?: boolean;
}

export type TaskProvider = "google" | "microsoft" | "todoist";

export interface TaskListFeed {
  id: string;
  name: string;
  provider: TaskProvider;
  tasks: TaskItem[];
}

export interface TasksData {
  updatedAt: number;
  google: { connected: boolean; lists: { id: string; name: string; tasks: TaskItem[] }[] };
  microsoft: { connected: boolean; lists: { id: string; name: string; tasks: TaskItem[] }[] };
  todoist: { connected: boolean; lists: { id: string; name: string; tasks: TaskItem[] }[] };
}

export type PackageCarrier = "ups" | "fedex" | "canadaPost" | "usps" | "other";

export type PackageStatus = "unknown" | "preTransit" | "inTransit" | "outForDelivery" | "delivered" | "exception";

export interface PackageTrack {
  id: string;
  carrier: PackageCarrier;
  trackingNumber: string;
  label?: string;
  status: PackageStatus;
  summary: string;
  eta?: string;
  updatedAt?: number;
}

export interface PackagesData {
  updatedAt: number;
  /** False when PACKAGE_TRACK_API_KEY is not set; numbers still show. */
  trackingConfigured: boolean;
  packages: PackageTrack[];
}

export interface TideEvent {
  time: string;
  type: "high" | "low";
  height?: number;
}

export interface TidesData {
  updatedAt: number;
  stationId: string;
  stationName: string;
  events: TideEvent[];
  units: "m" | "ft";
  byStation?: Record<string, TideEvent[]>;
}

export type BinKind = "garbage" | "recycling" | "organics" | "glass" | "other";

/** Upcoming collection days from the Township's calendar (src/server/garbage.ts). */
export interface GarbageData {
  updatedAt: number;
  /** False until an address is picked in the admin panel. */
  configured: boolean;
  pickups: { date: string; bins: { name: string; kind: BinKind }[] }[];
}

/** One drive from home, with live traffic (src/server/commute.ts). Times in seconds, distance in metres. */
export interface CommuteRoute {
  id: string;
  name: string;
  emoji: string;
  /** HH:MM, or "" when nobody needs to be there by a set time. */
  arriveBy: string;
  /** Absent when this route couldn't be read; the others still show. */
  seconds?: number;
  /** The same drive on empty roads. */
  freeFlowSeconds?: number;
  delaySeconds?: number;
  meters?: number;
  /** Epoch ms when the traffic was read. */
  at?: number;
}

export interface CommuteData {
  updatedAt: number;
  /** "key": TOMTOM_API_KEY isn't set; "places": no home or no destination yet; "": ready. */
  missing: "" | "key" | "places";
  routes: CommuteRoute[];
}

/** One BC Ferries sailing (src/server/ferries.ts). Times are HH:MM in Pacific time. */
export interface FerrySailing {
  time: string;
  /** HH:MM, or "" when BC Ferries gives none (or says "Variable"). */
  arrive: string;
  /** Sailings that have left are left out. */
  state: "scheduled" | "delayed" | "cancelled";
  /** Percent full, overall and for cars; absent when BC Ferries hasn't said. */
  fill?: number;
  carFill?: number;
  vessel: string;
  delayMinutes?: number;
  /** BC Ferries' own note on the sailing ("Delayed due to heavy traffic"). */
  note: string;
}

export interface FerryRouteData {
  code: string;
  name: string;
  /** "1h 35m" as BC Ferries writes it. */
  duration: string;
  /** "no-service" when nothing sails today; "" otherwise. */
  status: "" | "no-service";
  sailings: FerrySailing[];
}

export interface FerriesData {
  updatedAt: number;
  /** Epoch ms when BC Ferries' conditions were read (from the community API). */
  at: number;
  /** true when BC Ferries' data couldn't be read at all. */
  down: boolean;
  routes: FerryRouteData[];
}

/** One side of a game, as the sports widget shows it. */
export interface SportsSide {
  abbr: string;
  name: string;
  /** Absent before the game starts. */
  score?: string;
}

/** A game of a followed team (src/server/sports.ts). */
export interface SportsGame {
  id: string;
  /** Epoch ms of the start. */
  start: number;
  state: "pre" | "in" | "post";
  /** ESPN's own short status: "2nd - 12:34", "Final/OT", "Halftime". */
  detail: string;
  /** Which side the followed team is. */
  us: "home" | "away";
  home: SportsSide;
  away: SportsSide;
}

export interface SportsTeamData {
  /** The team's id in the settings document. */
  id: string;
  league: string;
  name: string;
  abbr: string;
  color: string;
  /** The game being played now, or the next one. */
  next?: SportsGame;
  /** The latest finished game. */
  last?: SportsGame;
  /** True when ESPN couldn't be read for this team and nothing was cached. */
  error?: boolean;
}

export interface SportsData {
  updatedAt: number;
  teams: SportsTeamData[];
}

export type AlertSeverity = "extreme" | "severe" | "moderate" | "minor";
export type AlertSource = "alertReady" | "weather" | "roads" | "earthquakes" | "power" | "evacuations";

/** One emergency alert for the area, from any source (src/server/alerts.ts). */
export interface EmergencyAlert {
  id: string;
  source: AlertSource;
  severity: AlertSeverity;
  title: string;
  area: string;
  description: string;
  /** Epoch ms. */
  sent: number;
  expires: number | null;
}

export interface AlertData {
  updatedAt: number;
  alerts: EmergencyAlert[];
}

/** One photo as a display gets it: [id, width, height, date taken (YYYY-MM-DD or "")]. Width and height are 0 when unknown. */
export type PhotoItem = [string, number, number, string];

export interface PhotoData {
  updatedAt: number;
  sources: Record<string, { photos: PhotoItem[]; error: string | null }>;
}

/** A Home Assistant entity as a display gets it (src/server/homeassistant.ts). */
export interface HaEntity {
  id: string;
  state: string;
  name: string;
  /** Epoch ms of the last state change. */
  changed: number;
  unit?: string;
  deviceClass?: string;
  /** Lights: 0 to 255. */
  brightness?: number;
  /** Thermostats. */
  current?: number;
  target?: number;
  min?: number;
  max?: number;
  step?: number;
  action?: string;
  /** Media players (Sonos, Spotify): what's playing and how loud. Only for media_player entities. */
  media?: HaMedia;
}

export interface HaMedia {
  title?: string;
  artist?: string;
  album?: string;
  /** Changes when the album art does; the picture itself comes through /api/display/art/. */
  art?: string;
  /** Seconds. */
  duration?: number;
  position?: number;
  /** Epoch ms when `position` was read. */
  positionAt?: number;
  /** 0 to 1. */
  volume?: number;
  muted?: boolean;
  source?: string;
  sources?: string[];
  /** Home Assistant's supported_features bit mask. */
  features: number;
}

export interface HaData {
  updatedAt: number;
  /** False until a URL and token are set in the admin panel. */
  configured: boolean;
  entities: Record<string, HaEntity>;
}

export type MusicService = "spotify" | "sonos";

/**
 * Spotify and Sonos signed in directly (src/server/music.ts), without Home Assistant. Players are keyed "spotify" or
 * "sonos:<player id>" and look like Home Assistant media players, so the music widget draws them the same way.
 */
export interface MusicData {
  updatedAt: number;
  services: Partial<Record<MusicService, { connected: boolean; error?: string }>>;
  players: Record<string, HaEntity>;
}

/** The meal plan from today (src/app/api/display/meals/): local date → that day's meals. */
export interface MealsData {
  today: string;
  meals: Record<string, Partial<Record<"breakfast" | "lunch" | "dinner", string>>>;
}

/** Times (epoch ms) of the radar pictures Environment Canada has for one kind of precipitation (src/server/radar.ts). */
export interface RadarTimes {
  /** Observed, oldest first, up to three hours back. */
  past: number[];
  /** Environment Canada's extrapolation of the radar, after the last observed picture. */
  forecast: number[];
  /** Why the times couldn't be read; the widget says so. */
  error?: string;
}

export interface RadarMap {
  x: number;
  y: number;
  homeX: number;
  homeY: number;
}

export interface RadarData {
  updatedAt: number;
  /**
   * The map around home for each zoom a widget uses: its top-left tile, and home's pixel on it. Displays get these,
   * never the dashboard's coordinates.
   */
  maps: Record<string, RadarMap>;
  layers: Partial<Record<"rain" | "snow", RadarTimes>>;
}

/** How far a wildfire is from being contained, from BC Wildfire Service's stage of control. */
export type FireStage = "new" | "outOfControl" | "held" | "underControl";

/** One active wildfire on the map (src/server/wildfires.ts). */
export interface WildfireFire {
  id: string;
  name: string;
  stage: FireStage;
  /** Estimated size in hectares. */
  ha: number;
  /** Distance from home in km. */
  km: number;
  /** BC Wildfire Service calls it a "wildfire of note" (highly visible or threatening). */
  ofNote: boolean;
  /** Pixel on the 5 × 5 tile map around home (src/lib/radar.ts). */
  x: number;
  y: number;
}

/** The wildfire map around home at one zoom: the same tiles as the radar, with everything drawn as map pixels. */
export interface WildfireMap extends RadarMap {
  fires: WildfireFire[];
  /** Burned area outlines of fires that aren't out, as SVG path data in map pixels. */
  perimeters: string[];
  /** Evacuation orders and alerts (any hazard), as SVG path data in map pixels. */
  evacuations: { kind: "order" | "alert"; d: string }[];
}

export interface WildfireData {
  updatedAt: number;
  maps: Record<string, WildfireMap>;
  /** Why the fires couldn't be read; the widget says so. */
  error?: string;
}

/** Today's chore chart (src/server/chores.ts): who does what today, what's done, and each person's stars this week. */
export interface ChoresData {
  today: string;
  pinSet: boolean;
  rewards: { id: string; name: string; starsCost: number }[];
  people: {
    id: string;
    name: string;
    emoji: string;
    color: string;
    goal: number;
    stars: number;
    /** Earned this week minus redemptions. */
    available: number;
  }[];
  /** Only the chores due today. */
  chores: { id: string; name: string; emoji: string; stars: number; period: "morning" | "afternoon" | "evening" | "anytime" }[];
  due: { choreId: string; personId: string; done: boolean }[];
}

/** The family shopping list (src/server/shopping.ts). */
export interface ShoppingItem {
  id: string;
  text: string;
  done: boolean;
}

export interface ShoppingData {
  updatedAt: number;
  items: ShoppingItem[];
}

/** Shared kitchen whiteboard (src/server/whiteboard.ts). Same doodle on every display. */
export type { WhiteboardData, WhiteboardStroke, WhiteboardTool } from "@/lib/whiteboard";

/** School / snow-day status from the district site (src/server/school.ts). */
export type SchoolState = "open" | "closed" | "delayed" | "unknown";

export interface SchoolData {
  updatedAt: number;
  state: SchoolState;
  /** Short line for the wall ("All schools closed", "Open", …). */
  summary: string;
  /** The notice text when the district posted one. */
  detail: string;
  districtName: string;
}

/** One person on the who's-home strip (drawn from the shared HA feed). */
export interface PresencePerson {
  entityId: string;
  label: string;
  home: boolean;
  /** Raw HA state when not a clear home/away. */
  state: string;
}

/** One bus (or train) leaving a stop, from TransLink's live feed (src/server/translink.ts). */
export interface TransitDeparture {
  /** The number riders know, like "502" or "R1". */
  route: string;
  /** Where it's going, without the route number ("Langley Centre"). */
  headsign: string;
  /** Epoch seconds of the predicted departure. */
  time: number;
  /** Seconds late (negative: early), when TransLink says. */
  delay: number | null;
  /** A vehicle is on the trip, so the time is a live prediction rather than the timetable. */
  live: boolean;
}

export interface TransitData {
  updatedAt: number;
  /** False until TRANSLINK_API_KEY is set in Vercel. */
  configured: boolean;
  /** Stop id → its next departures, soonest first. */
  stops: Record<string, TransitDeparture[]>;
}

/** WeatherFlow Tempest / AIR observation (src/server/tempest.ts). */
export interface TempestData {
  updatedAt: number;
  temp?: number;
  humidity?: number;
  wind?: number;
  gust?: number;
  rain?: number;
  pressure?: number;
  units: { temp: string; wind: string; rain: string };
  stale?: boolean;
}

/** One EcoFlow power station (src/server/ecoflow.ts). Watts are whole watts; minutes to full or to empty. */
export interface EcoFlowDevice {
  sn: string;
  name: string;
  online: boolean;
  soc?: number;
  inW?: number;
  outW?: number;
  solarW?: number;
  acInW?: number;
  acOutW?: number;
  dcOutW?: number;
  charging: boolean;
  minutes?: number;
  stale?: boolean;
}

export interface EcoFlowData {
  updatedAt: number;
  /** False until the household saves its EcoFlow keys. */
  configured: boolean;
  devices: EcoFlowDevice[];
  error?: string;
  stale?: boolean;
}

/** Weather Underground PWS current observation (src/server/weatherUnderground.ts). */
export interface WeatherUndergroundData {
  updatedAt: number;
  temp?: number;
  humidity?: number;
  wind?: number;
  gust?: number;
  rainRate?: number;
  rainToday?: number;
  observedAt?: string;
  units: { temp: string; wind: string; rain: string };
  stale?: boolean;
}

/** Nutrislice menu items for one widget (src/server/menus.ts). */
export interface MenusData {
  updatedAt: number;
  slug: string;
  school: string;
  slots: ("breakfast" | "lunch" | "dinner")[];
  days: Record<string, Partial<Record<"breakfast" | "lunch" | "dinner", string[]>>>;
  stale?: boolean;
}

export interface MenusFeedData {
  updatedAt: number;
  byWidget: Record<string, MenusData>;
}

/** Stock quote (Phase 5, src/server/stocks.ts). */
export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  currency: string;
}

export interface StocksData {
  updatedAt: number;
  stale?: boolean;
  quotes: Record<string, StockQuote>;
}

export interface CryptoQuote {
  id: string;
  currency: string;
  price: number;
  changePct: number;
}

export interface CryptoData {
  updatedAt: number;
  stale?: boolean;
  quotes: Record<string, CryptoQuote>;
}

export interface FxRate {
  base: string;
  quote: string;
  rate: number;
  date: string;
}

export interface FxData {
  updatedAt: number;
  stale?: boolean;
  rates: FxRate[];
}

export interface YnabData {
  updatedAt: number;
  stale?: boolean;
  connected: boolean;
  budgetName: string;
  accounts: { name: string; balance: number }[];
  categories: { name: string; balance: number }[];
}

export interface FitbitData {
  updatedAt: number;
  stale?: boolean;
  connected: boolean;
  steps: number;
  sleepMinutes: number;
  restingHeartRate?: number;
}

export interface EmailCountData {
  updatedAt: number;
  stale?: boolean;
  connected: boolean;
  unread: number;
}

export interface RssItem {
  title: string;
  link: string;
  feed?: string;
}

export interface RssData {
  updatedAt: number;
  stale?: boolean;
  items: RssItem[];
}

export interface DadJokeData {
  updatedAt: number;
  stale?: boolean;
  joke: string;
}

export interface QuotesData {
  updatedAt: number;
  stale?: boolean;
  quotes: { text: string; author: string }[];
}

export interface AffirmationData {
  updatedAt: number;
  date: string;
  category: string;
  text: string;
}

export interface HoroscopeData {
  updatedAt: number;
  date: string;
  sign: string;
  label: string;
  text: string;
}

export interface TrelloList {
  name: string;
  cards: string[];
}

export interface TrelloData {
  updatedAt: number;
  stale?: boolean;
  connected: boolean;
  boardName: string;
  lists: TrelloList[];
}

export interface SlackLine {
  channelId: string;
  text: string;
}

export interface SlackData {
  updatedAt: number;
  stale?: boolean;
  connected: boolean;
  unreadMentions: number;
  lines: SlackLine[];
}

export interface AirportRow {
  code: string;
  summary: string;
  temp?: number;
  wind?: number;
  category: string;
  delays: string[];
}

export interface AirportsData {
  updatedAt: number;
  stale?: boolean;
  airports: AirportRow[];
}

/** One UniFi site's internet health from UniFi Site Manager (src/server/unifi.ts). No IP addresses or MACs. */
export interface UnifiSite {
  id: string;
  name: string;
  /** "down" when the gateway is offline to UniFi's cloud or the latest reading has the WAN down. "Slow" is the widget's call. */
  status: "ok" | "down";
  isp?: string;
  /** Latest five-minute reading. Milliseconds and percent. */
  latency?: number;
  maxLatency?: number;
  packetLoss?: number;
  /** What the home was using in the latest five minutes, Mbps (not a speed test). */
  download?: number;
  upload?: number;
  /** Average latency over the last 24 hours, oldest first, at most 48 points (null where there was no reading). */
  spark: (number | null)[];
  /** WAN uptime over the last 24 hours, percent. */
  uptime24h?: number;
  /** Minutes the internet was down in the last 24 hours. */
  downMinutes24h: number;
  /** When the last outage in the last 24 hours ended (epoch ms), or started if it hasn't ended. */
  lastOutageAt?: number;
  /** Time of the latest reading (epoch ms). */
  readingAt?: number;
  devices?: number;
  offlineDevices?: number;
  clients?: number;
  guests?: number;
}

export interface UnifiData {
  updatedAt: number;
  /** False until a Site Manager API key is saved in Settings › UniFi network. */
  configured: boolean;
  sites: UnifiSite[];
  /** Short reason when UniFi refused or failed, for the empty state. */
  error?: string;
  stale?: boolean;
}
