import { zonedFormatter } from "../timeZone";
import { PERIODS, type Period } from "./periods";
import type { DashboardConfig, PeriodStart } from "./schema";

/** Minutes since midnight for sunrise and sunset when the weather feed has them. */
export type SunMinutes = { sunrise: number; sunset: number };

/** Used when a period starts at sunrise/sunset but today's times aren't known yet (rough mid-latitude day). */
export const SUN_FALLBACK: SunMinutes = { sunrise: 7 * 60, sunset: 18 * 60 };

// Minutes since midnight in a time zone, for "which part of the day is it" questions.
export function minutesInZone(now: Date, timeZone: string): number {
  const parts = zonedFormatter(timeZone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function parseHhmm(value: string): number {
  const [h = "0", m = "0"] = value.split(":");
  return Number(h) * 60 + Number(m);
}

/** Minutes since midnight from a local ISO time like 2026-11-17T08:21 (Open-Meteo's sunrise/sunset). */
export function minutesFromLocalIso(iso: string): number | null {
  const match = /T(\d{2}):(\d{2})/.exec(iso);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Number.isFinite(minutes) ? minutes : null;
}

export function sunMinutesFromIso(sunrise: string, sunset: string): SunMinutes | null {
  const rise = minutesFromLocalIso(sunrise);
  const set = minutesFromLocalIso(sunset);
  if (rise == null || set == null) return null;
  return { sunrise: rise, sunset: set };
}

/** Whether any period starts at sunrise or sunset (so the display should watch the weather feed). */
export function scheduleUsesSun(schedule: DashboardConfig["schedule"]): boolean {
  return PERIODS.some((p) => schedule[p].start === "sunrise" || schedule[p].start === "sunset");
}

/** Resolve a period's start to minutes since midnight. Falls back when sun times aren't known yet. */
export function periodStartMinutes(start: PeriodStart, sun: SunMinutes | null | undefined = null): number {
  if (start === "sunrise") return sun?.sunrise ?? SUN_FALLBACK.sunrise;
  if (start === "sunset") return sun?.sunset ?? SUN_FALLBACK.sunset;
  return parseHhmm(start);
}

/** The period of the day at `now`: the one whose start is the latest not after now (wrapping past midnight). */
export function currentPeriod(
  schedule: DashboardConfig["schedule"],
  now: Date,
  timeZone: string,
  sun: SunMinutes | null | undefined = null,
): Period {
  const minute = minutesInZone(now, timeZone);
  const sorted = [...PERIODS].sort((a, b) => periodStartMinutes(schedule[a].start, sun) - periodStartMinutes(schedule[b].start, sun));
  let current: Period = sorted[sorted.length - 1] ?? "night";
  for (const p of sorted) if (periodStartMinutes(schedule[p].start, sun) <= minute) current = p;
  return current;
}

/**
 * Milliseconds until the next `hour`:`minute` in `timeZone`. Once that time has passed (or it is that exact second),
 * it is tomorrow's. Seconds are the same in every zone; the hour and minute come from the zone.
 */
export function msUntilLocalTime(now: Date, timeZone: string, hour: number, minute: number): number {
  const target = hour * 60 + minute;
  let ahead = target - minutesInZone(now, timeZone);
  if (ahead <= 0) ahead += 24 * 60;
  return Math.max(0, (ahead * 60 - now.getSeconds()) * 1000 - now.getMilliseconds());
}

/** Milliseconds until the next period starts, so a display can switch exactly on time instead of polling. */
export function msUntilNextPeriod(
  schedule: DashboardConfig["schedule"],
  now: Date,
  timeZone: string,
  sun: SunMinutes | null | undefined = null,
): number {
  const minute = minutesInZone(now, timeZone);
  const starts = PERIODS.map((p) => periodStartMinutes(schedule[p].start, sun)).sort((a, b) => a - b);
  const next = starts.find((s) => s > minute) ?? (starts[0] ?? 0) + 24 * 60;
  const seconds = now.getSeconds();
  return Math.max(1000, ((next - minute) * 60 - seconds) * 1000);
}

/** A calendar date (YYYY-MM-DD) in a time zone. */
export function dateInZone(now: Date, timeZone: string): string {
  return zonedFormatter(timeZone, { year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Whole days from `from` to `to`, both YYYY-MM-DD, ignoring daylight saving. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
