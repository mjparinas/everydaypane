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
  doorbell: { enabled: boolean; seconds: number };
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
