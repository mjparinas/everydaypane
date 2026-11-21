import type { DashboardConfig, Theme, View } from "@/lib/config/schema";

// What a display receives: the parts of the settings document it needs, nothing secret. Built by
// src/server/display.ts, read by src/display/. Types only, so the display bundle carries no schema code.

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
  current: { temp: number; feels: number; code: number; isDay: boolean; wind: number; humidity: number };
  today: { sunrise: string; sunset: string };
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

export interface TasksData {
  updatedAt: number;
  /** False until an admin connects Google Tasks in the admin panel. */
  connected: boolean;
  lists: { id: string; name: string; tasks: TaskItem[] }[];
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
export type AlertSource = "alertReady" | "weather" | "roads" | "earthquakes" | "power";

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

/** Today's chore chart (src/server/chores.ts): who does what today, what's done, and each person's stars this week. */
export interface ChoresData {
  today: string;
  people: { id: string; name: string; emoji: string; color: string; goal: number; stars: number }[];
  /** Only the chores due today. */
  chores: { id: string; name: string; emoji: string; stars: number }[];
  due: { choreId: string; personId: string; done: boolean }[];
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
