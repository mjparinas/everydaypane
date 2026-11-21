import type { ScreenSaver } from "./config/schema";
import { parseHhmm } from "./config/time";

// The screen saver's rules (Melvin, 2026-11-21), kept apart from the schema so the display can import them without
// zod. The display asks `saverMode` every few seconds; everything it needs is passed in, so it is easy to test.

/** Off until switched on, so a settings document saved before the screen saver existed behaves the same. */
export const SCREEN_SAVER_OFF: ScreenSaver = {
  idle: false,
  minutes: 10,
  shows: "photos",
  photoSourceIds: [],
  showClock: true,
  night: false,
  nightStart: "23:00",
  nightEnd: "06:00",
  motionEntityIds: [],
};

export type SaverMode = "off" | "photos" | "dark";

/** Whether `minute` (minutes since midnight) falls in a window that may run past midnight. Equal ends mean never. */
export function inWindow(start: string, end: string, minute: number): boolean {
  const a = parseHhmm(start);
  const b = parseHhmm(end);
  if (a === b) return false;
  return a < b ? minute >= a && minute < b : minute >= a || minute < b;
}

export interface SaverClock {
  now: number;
  /** Minutes since midnight in the dashboard's time zone. */
  minute: number;
  /** The last touch, key, motion, doorbell ring or new alert (-Infinity when there hasn't been one). */
  lastActivity: number;
  /** When the page loaded: a reload counts as use for the idle timer, but never wakes the night screen. */
  loadedAt: number;
}

export function saverMode(s: ScreenSaver, c: SaverClock): SaverMode {
  const awake = s.minutes * 60_000;
  if (s.night && inWindow(s.nightStart, s.nightEnd, c.minute) && c.now - c.lastActivity >= awake) return "dark";
  if (s.idle && c.now - Math.max(c.lastActivity, c.loadedAt) >= awake) return s.shows;
  return "off";
}
