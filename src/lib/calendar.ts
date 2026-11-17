import type { CalendarEvent } from "@/lib/display/types";

// Date arithmetic for the schedule and month widgets. Plain functions on YYYY-MM-DD strings, shared by the display
// and the tests; no libraries, so the display bundle stays small. Events are placed by the dashboard's time zone.

const DAY = 86_400_000;
const dtf = new Map<string, Intl.DateTimeFormat>();
function fmt(timeZone: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = timeZone + JSON.stringify(opts);
  let f = dtf.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone, ...opts });
    dtf.set(key, f);
  }
  return f;
}

export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** The local date (YYYY-MM-DD) of a moment, in a zone. */
export const localDate = (ms: number, timeZone: string) => fmt(timeZone, { year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);

/** Every local date an event touches (an all-day event's end date is exclusive, as Google sends it). */
export function eventDays(e: CalendarEvent, timeZone: string): string[] {
  let first: string;
  let last: string;
  if (e.allDay) {
    first = e.start.slice(0, 10);
    last = addDays(e.end.slice(0, 10), -1);
  } else {
    const s = Date.parse(e.start);
    const en = Date.parse(e.end);
    first = localDate(s, timeZone);
    // An event ending at midnight belongs to the day before.
    last = localDate(Math.max(s, en - 1), timeZone);
  }
  if (last < first) last = first;
  const days: string[] = [];
  for (let d = first; d <= last && days.length < 62; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Events on each local date, in the order the server sent them (all-day first, then by start). */
export function byDay(events: CalendarEvent[], timeZone: string): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    for (const d of eventDays(e, timeZone)) {
      const list = map.get(d);
      if (list) list.push(e);
      else map.set(d, [e]);
    }
  }
  for (const list of map.values()) list.sort((a, b) => Number(b.allDay) - Number(a.allDay));
  return map;
}

/** The weeks of a month grid: whole weeks from the one holding the 1st to the one holding the last day. */
export function monthGrid(today: string, weekStartsOn: 0 | 1): string[][] {
  const first = `${today.slice(0, 8)}01`;
  const dow = new Date(`${first}T00:00:00Z`).getUTCDay();
  let d = addDays(first, -((dow - weekStartsOn + 7) % 7));
  const month = today.slice(0, 7);
  const weeks: string[][] = [];
  while (weeks.length < 6) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++, d = addDays(d, 1)) week.push(d);
    weeks.push(week);
    if (d.slice(0, 7) !== month) break;
  }
  return weeks;
}

/** "Today", "Tomorrow" or "Wed, Nov 19". */
export function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return fmt("UTC", { weekday: "short", month: "short", day: "numeric" }).format(Date.parse(`${date}T12:00:00Z`));
}

/** An event's time on a given day: "All day", "9:30 AM", "Until 11 AM" or "From 8 PM" for events crossing midnight. */
export function eventTime(e: CalendarEvent, date: string, timeZone: string, hour12: boolean): string {
  if (e.allDay) return "All day";
  const time = (ms: number) => {
    const parts = fmt(timeZone, { hour: "numeric", minute: "2-digit", hour12 }).formatToParts(ms);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const hm = get("minute") === "00" && hour12 ? get("hour") : `${get("hour")}:${get("minute")}`;
    const ap = get("dayPeriod").replace(/\./g, "").toUpperCase();
    return hour12 && ap ? `${hm} ${ap}` : hm;
  };
  const s = Date.parse(e.start);
  const en = Date.parse(e.end);
  const startsToday = localDate(s, timeZone) === date;
  const endsToday = localDate(Math.max(s, en - 1), timeZone) === date;
  if (startsToday) return time(s);
  if (endsToday) return `Until ${time(en)}`;
  return "All day";
}
