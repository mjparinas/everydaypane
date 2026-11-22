import "server-only";

import ICAL from "ical.js";

import type { DashboardConfig } from "@/lib/config/schema";
import type { CalendarEvent } from "@/lib/display/types";
import { reliableTimeZone } from "@/lib/timeZone";

import { cached } from "./cache";
import { getSecret, setSecret } from "./secrets";

// Calendar links (Melvin, 2026-11-17: "can you add support for multiple calendars"). Any calendar that offers an iCal
// address (a school or sports calendar, a partner's Google or Outlook calendar through its secret address) can be added
// in Settings. The address often works as a password, so it is a stored secret (`ical.<id>`), never in the settings
// document; the document holds only the name, colour and whether it shows. Recurring events are expanded here with
// ical.js, so the display gets plain events like Google's.

const TTL = 15 * 60_000;
const MAX_BYTES = 3_000_000;
const MAX_OCCURRENCES = 1500;

export type IcalLink = DashboardConfig["integrations"]["icals"][number];

const secretKey = (id: string) => `ical.${id}` as const;

export async function getIcalUrl(id: string): Promise<string | null> {
  return getSecret(secretKey(id));
}

export async function setIcalUrl(id: string, url: string | null): Promise<void> {
  await setSecret(secretKey(id), url);
}

/**
 * Checks a pasted calendar address and returns it in the form we fetch (webcal:// becomes https://), or an error
 * message. Only https, and never an address on this machine or a private network.
 */
export function normaliseIcalUrl(raw: string): { url: string } | { error: string } {
  let u: URL;
  try {
    u = new URL(raw.trim().replace(/^webcals?:\/\//i, "https://"));
  } catch {
    return { error: "That doesn't look like a web address." };
  }
  if (u.protocol !== "https:") return { error: "Use the calendar's https:// or webcal:// address." };
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || /^[\d.]+$/.test(host) || host.includes(":")) {
    return { error: "Use the calendar's public address." };
  }
  if (u.username || u.password) return { error: "Use an address without a name and password in it." };
  return { url: u.toString() };
}

async function download(url: string): Promise<string> {
  const r = await fetch(url, { headers: { accept: "text/calendar, */*" }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(r.status === 404 ? "The calendar address wasn't found (404)." : `The calendar's server answered ${r.status}.`);
  if (new URL(r.url || url).protocol !== "https:") throw new Error("The calendar moved to an insecure address.");
  const length = Number(r.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new Error("The calendar is too big to read.");
  const text = await r.text();
  if (text.length > MAX_BYTES) throw new Error("The calendar is too big to read.");
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("That address isn't an iCal calendar.");
  return text;
}

/** The UTC offset of a time zone at an instant, in milliseconds. */
function offsetMs(at: number, timeZone: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: reliableTimeZone(timeZone, at),
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const n = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second")) - Math.floor(at / 1000) * 1000;
}

/** A wall-clock time in a time zone, as an instant. */
function zonedInstant(t: ICAL.Time, timeZone: string): number {
  const wall = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
  const first = wall - offsetMs(wall, timeZone);
  return wall - offsetMs(first, timeZone);
}

const knownZone = (tz: string | null | undefined): tz is string => {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/**
 * An ICAL time as the feed sends it: YYYY-MM-DD for all-day dates, otherwise an ISO instant. Times in a zone the
 * file describes are converted by ical.js; a named zone it doesn't describe goes through Intl, and floating times
 * (no zone at all) are read in the dashboard's zone.
 */
function stamp(t: ICAL.Time, tzid: string | null, dashboardZone: string): string {
  if (t.isDate) return t.toString().slice(0, 10);
  const zone = t.zone?.tzid;
  if (zone && zone !== "floating" && (zone === "UTC" || t.zone !== ICAL.Timezone.localTimezone)) {
    if (zone === "UTC" || ICAL.TimezoneService.has(zone)) return t.toJSDate().toISOString();
  }
  return new Date(zonedInstant(t, knownZone(tzid) ? tzid : dashboardZone)).toISOString();
}

/** When a time happens, roughly (all-day dates count from UTC midnight): enough to pick the feed's days. */
const instant = (t: ICAL.Time, tzid: string | null, zone: string) =>
  Date.parse(t.isDate ? `${stamp(t, null, zone)}T00:00:00Z` : stamp(t, tzid, zone));

const tzidOf = (event: ICAL.Event, name: "dtstart" | "dtend"): string | null => {
  const v = event.component.getFirstProperty(name)?.getParameter("tzid");
  return typeof v === "string" ? v : null;
};

/**
 * Every event (and every occurrence of a recurring one) that overlaps [from, to), as the display draws them.
 * Exported for tests.
 */
export function parseIcal(
  text: string,
  link: { id: string; name: string; color: string },
  from: string,
  to: string,
  timeZone: string,
): CalendarEvent[] {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    const id = tz.getFirstPropertyValue("tzid");
    if (typeof id === "string" && !ICAL.TimezoneService.has(id)) ICAL.TimezoneService.register(new ICAL.Timezone(tz), id);
  }
  const vevents = root.getAllSubcomponents("vevent");
  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const v of vevents) {
    const e = new ICAL.Event(v);
    if (e.isRecurrenceException()) exceptions.push(e);
    else masters.set(e.uid, e);
  }
  for (const ex of exceptions) {
    const master = masters.get(ex.uid);
    if (master) master.relateException(ex);
    else masters.set(`${ex.uid}@${ex.recurrenceId.toString()}`, ex);
  }

  // A day either side covers every time zone, as with Google; the display places events in its own zone.
  const lo = Date.parse(`${from}T00:00:00Z`) - 86_400_000;
  const hi = Date.parse(`${to}T00:00:00Z`) + 86_400_000;
  const out: CalendarEvent[] = [];
  const add = (item: ICAL.Event, start: ICAL.Time, end: ICAL.Time, key: string) => {
    if ((item.component.getFirstPropertyValue("status") as string | null)?.toUpperCase() === "CANCELLED") return;
    const s = stamp(start, tzidOf(item, "dtstart"), timeZone);
    const e = stamp(end, tzidOf(item, "dtend") ?? tzidOf(item, "dtstart"), timeZone);
    if (instant(end, null, timeZone) < lo || instant(start, null, timeZone) >= hi) return;
    out.push({
      id: `ical:${link.id}:${key}`.slice(0, 250),
      title: (item.summary || "Busy").slice(0, 120),
      start: s,
      end: e,
      allDay: start.isDate,
      color: link.color,
      calendar: link.name,
      ...(item.location ? { location: item.location.slice(0, 80) } : {}),
    });
  };

  for (const [uid, event] of masters) {
    if (!event.startDate) continue;
    const end = event.endDate ?? event.startDate;
    if (!event.isRecurring()) {
      add(event, event.startDate, end, uid);
      continue;
    }
    const it = event.iterator();
    for (let i = 0, next = it.next(); next && i < MAX_OCCURRENCES; i++, next = it.next()) {
      const d = event.getOccurrenceDetails(next);
      if (instant(d.startDate, tzidOf(d.item, "dtstart"), timeZone) >= hi) break;
      add(d.item, d.startDate, d.endDate, `${uid}@${next.toString()}`);
    }
  }
  return out;
}

/** The link's events for the feed's days, cached for 15 minutes (served stale if the calendar's server fails). */
export async function icalEvents(link: IcalLink, from: string, to: string, timeZone: string, now = Date.now()): Promise<CalendarEvent[]> {
  const url = await getIcalUrl(link.id);
  if (!url) return [];
  const got = await cached(
    `ical:${link.id}:${from}:${to}:${link.color}:${link.name}`,
    TTL,
    async () => parseIcal(await download(url), link, from, to, timeZone),
    now,
  );
  return got.value;
}

/** Fetches and reads a pasted address once, so the admin panel can say whether it works and how many events it has. */
export async function checkIcal(url: string, from: string, to: string, timeZone: string): Promise<{ events: number; name: string | null }> {
  const text = await download(url);
  const name = /^X-WR-CALNAME:(.*)$/im.exec(text)?.[1]?.trim().slice(0, 60) ?? null;
  return { events: parseIcal(text, { id: "check", name: "", color: "#000000" }, from, to, timeZone).length, name };
}
