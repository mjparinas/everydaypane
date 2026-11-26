import type { CountdownEvent } from "./schema";
import { daysBetween } from "./time";

export interface UpcomingEvent {
  event: CountdownEvent;
  date: string;
  days: number;
  /** For birthdays with a birth year: the age they turn. */
  turning: number | null;
  /** For anniversaries: how many years it will be on the day (15 for a 2011 wedding in 2026). */
  years: number | null;
}

/** The wall's headline on the day itself: "Happy birthday, Sam!", "Happy anniversary, Mom & Dad!", "Christmas is today!". */
export function celebration(u: UpcomingEvent): string {
  if (u.event.kind === "birthday") return `Happy birthday, ${u.event.name}!`;
  if (u.event.kind === "anniversary") return `Happy anniversary, ${u.event.name}!`;
  return `${u.event.name} is today!`;
}

/** "turns 12", "15 years", or nothing. */
export function milestone(u: UpcomingEvent): string {
  if (u.turning) return `turns ${u.turning}`;
  if (u.years) return u.years === 1 ? "1 year" : `${u.years} years`;
  return "";
}

/** The next occurrence of each event on or after `today` (YYYY-MM-DD), soonest first. Past one-off events are dropped. */
export function upcoming(events: readonly CountdownEvent[], today: string): UpcomingEvent[] {
  const year = Number(today.slice(0, 4));
  const out: UpcomingEvent[] = [];
  for (const event of events) {
    let date = event.date;
    if (event.yearly) {
      const monthDay = event.date.slice(5);
      date = `${year}-${monthDay}`;
      if (date < today) date = `${year + 1}-${monthDay}`;
      // 29 February in a year without one: celebrate on the 28th.
      if (monthDay === "02-29" && Number.isNaN(Date.parse(`${date}T00:00:00Z`)) === false) {
        const y = Number(date.slice(0, 4));
        const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
        if (!leap) date = `${y}-02-28`;
      }
    } else if (date < today) {
      continue;
    }
    const born = Number(event.date.slice(0, 4));
    const span = event.yearly && born < Number(date.slice(0, 4)) ? Number(date.slice(0, 4)) - born : null;
    const turning = event.kind === "birthday" ? span : null;
    const years = event.kind === "anniversary" ? span : null;
    out.push({ event, date, days: daysBetween(today, date), turning, years });
  }
  return out.sort((a, b) => a.days - b.days || a.event.name.localeCompare(b.event.name));
}
