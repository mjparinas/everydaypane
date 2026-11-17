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

export type BinKind = "garbage" | "recycling" | "organics" | "glass" | "other";

/** Upcoming collection days from the Township's calendar (src/server/garbage.ts). */
export interface GarbageData {
  updatedAt: number;
  /** False until an address is picked in the admin panel. */
  configured: boolean;
  pickups: { date: string; bins: { name: string; kind: BinKind }[] }[];
}

export type AlertSeverity = "extreme" | "severe" | "moderate" | "minor";
export type AlertSource = "alertReady" | "weather" | "roads" | "earthquakes";

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
