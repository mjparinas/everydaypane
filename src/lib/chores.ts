import type { Chore, ChorePerson } from "./config/schema";

// The chore chart (Melvin, 2026-11-21): recurring chores, shared or taken in turns, ticked off on the wall, with stars
// counted per person for the week. Shared by the server, the admin panel and the display, so it holds no zod and no
// React. Dates are local YYYY-MM-DD strings in the dashboard's time zone; weeks start on Monday.
// Periods (Melvin, 2026-11-23): morning / afternoon / evening / anytime for wall bands, inspired by homescreens.dev.
// Keep the period constants here (not as a value import from schema.ts) so the display bundle never pulls in zod.

export const CHORE_PERIODS = ["morning", "afternoon", "evening", "anytime"] as const;
export type ChorePeriod = (typeof CHORE_PERIODS)[number];

const DAY = 86_400_000;
// A Monday long ago that every rotation counts from, so turns don't depend on when a chore was added.
const ANCHOR = "2024-01-01";

const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY);
const mod = (n: number, m: number) => ((n % m) + m) % m;

/** 0 = Sunday … 6 = Saturday. */
export const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Monday 0 … Sunday 6, the position in a Monday-first week. */
const position = (day: number) => (day + 6) % 7;

/** The Monday of the week a date is in. */
export function weekStart(date: string): string {
  return new Date((dayNumber(date) - position(weekday(date))) * DAY).toISOString().slice(0, 10);
}

/**
 * Who does a chore on a date: nobody when it isn't due that day; everyone picked for a shared chore; otherwise one of
 * them in turn. A daily rotation counts the days the chore is due (so a Monday, Wednesday, Friday chore for two kids
 * alternates every time, not every calendar day); a weekly one moves on each Monday. People no longer on the chart are
 * skipped.
 */
export function assignees(chore: Chore, date: string, known?: ReadonlySet<string>): string[] {
  const people = known ? chore.personIds.filter((p) => known.has(p)) : chore.personIds;
  const today = weekday(date);
  if (!people.length || !chore.days.includes(today)) return [];
  if (chore.rotate === "none") return people;
  const weeks = Math.floor((dayNumber(weekStart(date)) - dayNumber(ANCHOR)) / 7);
  const turn = chore.rotate === "week" ? weeks : weeks * chore.days.length + chore.days.filter((d) => position(d) < position(today)).length;
  return [people[mod(turn, people.length)] as string];
}

/** Everything due on a date, as chore and person pairs, in the chart's order. */
export function dueOn(people: ChorePerson[], chores: Chore[], date: string): { choreId: string; personId: string }[] {
  const known = new Set(people.map((p) => p.id));
  return chores.flatMap((c) => assignees(c, date, known).map((personId) => ({ choreId: c.id, personId })));
}

/** The weekday names a chore is due, for the admin panel ("Every day", "Weekdays", "Mon, Wed, Fri"). */
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export function daysLabel(days: number[]): string {
  const set = new Set(days);
  if (set.size === 7) return "Every day";
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return "Weekdays";
  if (set.size === 2 && set.has(0) && set.has(6)) return "Weekends";
  return [1, 2, 3, 4, 5, 6, 0]
    .filter((d) => set.has(d))
    .map((d) => WEEKDAYS[d])
    .join(", ");
}

export const PERIOD_LABELS: Record<ChorePeriod, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  anytime: "Anytime",
};

/** Sort order for wall bands (morning first, anytime last). */
export function periodRank(period: ChorePeriod): number {
  return CHORE_PERIODS.indexOf(period);
}

/**
 * Which band is "now" on the wall clock. Morning before noon, afternoon until 5 PM, evening after that.
 * `anytime` is never the active band — those chores sit under every list without a highlight.
 */
export function activePeriod(hour: number): Exclude<ChorePeriod, "anytime"> {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
