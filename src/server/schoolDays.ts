import "server-only";

import type { DashboardConfig } from "@/lib/config/schema";
import { dateInZone } from "@/lib/config/time";
import type { CalendarEvent, SchoolDaysData } from "@/lib/display/types";
import { addDays, kindFromTitle, mergeDaysOff, nameFromTitle, type SchoolDayOff } from "@/lib/schoolCalendar";

import { icalEvents } from "./ical";

// School days (Melvin, 2026-11-26): the school year from the settings document, plus days off read from the school
// calendar links the household picked under Settings › School days. A link is read even when it is switched off for
// the family calendar, so a school's calendar can feed this widget without crowding the month grid. Each link is
// cached by ical.ts (15 minutes) and one failing never hides the household's own list.

/** How far ahead calendar links are read: the rest of a school year from any day in it. */
const AHEAD_DAYS = 300;

/** Days off a school calendar's events describe: all-day "Pro-D", "No school", "break" events, and early dismissals. */
export function daysOffFromEvents(events: CalendarEvent[]): SchoolDayOff[] {
  const out: SchoolDayOff[] = [];
  for (const e of events) {
    const kind = kindFromTitle(e.title);
    if (!kind) continue;
    const start = e.start.slice(0, 10);
    if (kind === "off") {
      // Timed "no school" events are usually reminders on a day that is already in the list; only all-day ones count.
      if (!e.allDay) continue;
      const end = e.end.length >= 10 ? addDays(e.end.slice(0, 10), -1) : start;
      out.push({ start, end: end < start ? start : end, name: nameFromTitle(e.title), kind });
    } else out.push({ start, end: start, name: nameFromTitle(e.title), kind });
  }
  return out;
}

export async function schoolDaysFeed(accountId: string, config: DashboardConfig, now = Date.now()): Promise<SchoolDaysData> {
  const s = config.school;
  const tz = config.location.timeZone;
  const today = dateInZone(new Date(now), tz);
  const links = config.integrations.icals.filter((l) => s.icalIds.includes(l.id));
  const fromLinks: SchoolDayOff[] = [];
  let error: string | undefined;
  for (const link of links) {
    try {
      fromLinks.push(...daysOffFromEvents(await icalEvents(accountId, link, today, addDays(today, AHEAD_DAYS), tz, now)));
    } catch {
      error = `Couldn't read ${link.name || "a school calendar link"}`;
    }
  }
  // Past days are dropped so the wall gets only what it can still show.
  const daysOff = mergeDaysOff(s.daysOff, fromLinks).filter((d) => d.end >= today);
  return {
    updatedAt: now,
    calendarName: s.calendarName,
    firstDay: s.firstDay,
    lastDay: s.lastDay,
    daysOff,
    lunches: s.lunches,
    ...(error ? { error } : {}),
  };
}
