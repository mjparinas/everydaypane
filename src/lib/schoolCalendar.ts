// School days (Melvin, 2026-11-26: "school lunch menu and school-day calendar"): which days the kids have no school
// (Pro-D days, holidays, winter and spring break, summer) and the weekly hot-lunch days, so the wall can say "No school
// tomorrow: Pro-D Day" and "Spring break in 9 days". Shared by the server (feed), the display (today and the next
// days off, worked out on the wall so midnight rolls over) and the household panel (presets). No zod or DOM here.

export type SchoolDayKind = "off" | "early";

export interface SchoolDayOff {
  /** First day, YYYY-MM-DD. */
  start: string;
  /** Last day, inclusive, YYYY-MM-DD (the same as start for one day). */
  end: string;
  name: string;
  /** "off": no school; "early": school, but an early dismissal. */
  kind: SchoolDayKind;
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const LUNCH_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;

/** A preset school year from a district's published calendar. */
export interface SchoolPreset {
  id: string;
  label: string;
  calendarName: string;
  firstDay: string;
  lastDay: string;
  daysOff: SchoolDayOff[];
  source: string;
}

const off = (start: string, name: string, end = start): SchoolDayOff => ({ start, end, name, kind: "off" });
const early = (start: string, name: string): SchoolDayOff => ({ start, end: start, name, kind: "early" });

// Langley School District 2026–27, approved by the Board on 2026-04-28 (read from the district's elementary and middle
// PDFs at sd35.bc.ca/school-calendar on 2026-11-26). The district publishes PDFs only, no iCal link. Breaks are the
// days between "last day prior to" and "school re-opens". Days with no school that both calendars share:
const SD35_SHARED: SchoolDayOff[] = [
  off("2026-09-25", "School Improvement Day"),
  off("2026-09-30", "Truth and Reconciliation Day"),
  off("2026-10-12", "Thanksgiving"),
  off("2026-10-23", "Pro-D Day"),
  off("2026-11-11", "Remembrance Day"),
  off("2026-11-20", "Design & Assessment Day"),
  off("2026-12-18", "Winter Break", "2027-01-04"),
  off("2027-02-08", "Pro-D Day"),
  off("2027-02-15", "Family Day"),
  off("2027-03-15", "Spring Break", "2027-03-29"),
  off("2027-04-12", "Design & Assessment Day"),
  off("2027-05-21", "Pro-D Day"),
  off("2027-05-24", "Victoria Day"),
];

const SD35_SOURCE = "Langley School District 2026–27 calendar, approved April 28, 2026 (sd35.bc.ca/school-calendar)";

export const SCHOOL_PRESETS: SchoolPreset[] = [
  {
    id: "sd35-elementary-2026-27",
    label: "Langley elementary, 2026–27",
    calendarName: "Langley Elementary",
    firstDay: "2026-09-08",
    lastDay: "2027-06-29",
    daysOff: sortDays([
      ...SD35_SHARED,
      early("2026-12-03", "Early dismissal (conferences)"),
      early("2027-03-03", "Early dismissal (conferences)"),
    ]),
    source: SD35_SOURCE,
  },
  {
    id: "sd35-middle-2026-27",
    label: "Langley middle school, 2026–27",
    calendarName: "Langley Middle School",
    firstDay: "2026-09-08",
    lastDay: "2027-06-29",
    daysOff: sortDays([
      ...SD35_SHARED,
      early("2026-10-21", "Early dismissal (interviews)"),
      early("2026-10-22", "Early dismissal (interviews)"),
      early("2027-04-28", "Early dismissal (interviews)"),
      early("2027-04-29", "Early dismissal (interviews)"),
    ]),
    source: SD35_SOURCE,
  },
];

export function sortDays(days: SchoolDayOff[]): SchoolDayOff[] {
  return [...days].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

/** YYYY-MM-DD plus n days (UTC arithmetic, so daylight saving never shifts it). */
export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

const isWeekend = (date: string) => weekday(date) === 0 || weekday(date) === 6;

// Titles in a school's own calendar that mean no school that day, and the ones that mean an early dismissal. They err
// on matching: a parent would rather see a Pro-D day that wasn't than miss one.
const OFF_RE =
  /\b(pro[- ]?d|professional development|non[- ]?instructional|no school|schools? (?:is |are )?closed|not in attendance|no classes|winter (?:break|vacation)|spring (?:break|vacation)|christmas (?:break|vacation)|day in lieu|administrative day|school improvement day|design (?:&|and) assessment day|statutory holiday|stat holiday|family day|thanksgiving|remembrance day|truth and reconciliation|good friday|easter monday|victoria day|labour day)\b/i;
const EARLY_RE = /\b(early dismissal|early release|half[- ]day)\b/i;

/** What a calendar event's title says about school, or null when it says nothing about attendance. */
export function kindFromTitle(title: string): SchoolDayKind | null {
  if (EARLY_RE.test(title)) return "early";
  if (OFF_RE.test(title)) return "off";
  return null;
}

/** Tidies a day-off name taken from a calendar title ("NO SCHOOL - Pro-D Day (Students not in attendance)"). */
export function nameFromTitle(title: string): string {
  const t = title
    .replace(/\s*\((?:students?\s+)?not in attendance\)/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.slice(0, 60) || "No School";
}

export type SchoolToday =
  | { state: "school"; early?: string; firstDay?: boolean; lastDay?: boolean }
  | { state: "weekend" }
  | { state: "off"; name: string; backOn: string | null }
  | { state: "summer"; backOn: string | null };

export interface SchoolYear {
  firstDay: string;
  lastDay: string;
  daysOff: SchoolDayOff[];
}

function entryOn(year: SchoolYear, date: string, kind: SchoolDayKind): SchoolDayOff | undefined {
  return year.daysOff.find((d) => d.kind === kind && d.start <= date && date <= d.end);
}

/** True when the kids are at school that day (an early dismissal still counts). */
export function isSchoolDay(year: SchoolYear, date: string): boolean {
  if (isWeekend(date)) return false;
  if (year.firstDay && date < year.firstDay) return false;
  if (year.lastDay && date > year.lastDay) return false;
  return !entryOn(year, date, "off");
}

/** The next school day after `date`, within a year's search; null when the calendar doesn't say (summer, no next year). */
export function nextSchoolDay(year: SchoolYear, date: string): string | null {
  let d = addDays(date, 1);
  for (let i = 0; i < 120; i++, d = addDays(d, 1)) {
    if (year.lastDay && d > year.lastDay) return null;
    if (isSchoolDay(year, d)) return d;
  }
  return null;
}

export function schoolToday(year: SchoolYear, date: string): SchoolToday {
  const outside = (year.firstDay && date < year.firstDay) || (year.lastDay && date > year.lastDay);
  if (outside) {
    const back = year.firstDay && date < year.firstDay ? year.firstDay : null;
    // A few days before the first day reads as summer; a weekend inside the year never does.
    return { state: "summer", backOn: back };
  }
  const o = entryOn(year, date, "off");
  // A weekend inside a break reads as the break; a one-day entry on a weekend is just the weekend.
  if (o && (!isWeekend(date) || o.start !== o.end)) return { state: "off", name: o.name, backOn: nextSchoolDay(year, date) };
  if (isWeekend(date)) return { state: "weekend" };
  const e = entryOn(year, date, "early");
  return {
    state: "school",
    ...(e ? { early: e.name } : {}),
    ...(date === year.firstDay ? { firstDay: true } : {}),
    ...(date === year.lastDay ? { lastDay: true } : {}),
  };
}

export interface UpcomingOff {
  start: string;
  end: string;
  name: string;
  /** School days missed (weekdays inside the range). */
  weekdays: number;
}

/**
 * The next stretches with no school on weekdays, from tomorrow (or today when `includeToday`), soonest first. Weekend
 * days are never listed on their own; a Friday Pro-D day is one entry, not a long weekend. Summer ends the list with
 * the last day of school.
 */
export function upcomingDaysOff(year: SchoolYear, date: string, count: number, includeToday = false): UpcomingOff[] {
  const out: UpcomingOff[] = [];
  for (const d of year.daysOff) {
    if (d.kind !== "off") continue;
    if (d.end < (includeToday ? date : addDays(date, 1))) continue;
    let weekdays = 0;
    for (let x = d.start; x <= d.end; x = addDays(x, 1)) if (!isWeekend(x)) weekdays++;
    if (!weekdays) continue;
    out.push({ start: d.start, end: d.end, name: d.name, weekdays });
  }
  if (year.lastDay && year.lastDay >= date) {
    const summer = addDays(year.lastDay, 1);
    if (!out.some((o) => o.start === summer)) out.push({ start: summer, end: summer, name: "Summer Holidays", weekdays: 50 });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start)).slice(0, count);
}

/** The weekly lunch line for a date (Monday to Friday), or "" for none. */
export function lunchOn(lunches: readonly string[], date: string): string {
  const wd = weekday(date);
  return wd >= 1 && wd <= 5 ? (lunches[wd - 1] ?? "").trim() : "";
}

/**
 * Days off from the household's list and from school calendar links merged into one list: the same day named twice is
 * kept once, the household's own entry winning.
 */
export function mergeDaysOff(own: SchoolDayOff[], fromLinks: SchoolDayOff[]): SchoolDayOff[] {
  const covered = (d: SchoolDayOff) => own.some((o) => o.kind === d.kind && o.start <= d.start && d.end <= o.end);
  const seen = new Set<string>();
  const extra = fromLinks.filter((d) => {
    const k = `${d.kind}:${d.start}:${d.end}`;
    if (covered(d) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return sortDays([...own, ...extra]);
}
