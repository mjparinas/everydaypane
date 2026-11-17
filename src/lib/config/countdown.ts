import type { CountdownEvent } from "./schema";
import { daysBetween } from "./time";

export interface UpcomingEvent {
  event: CountdownEvent;
  date: string;
  days: number;
  /** For birthdays with a birth year: the age they turn. */
  turning: number | null;
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
    const turning = event.kind === "birthday" && event.yearly && born < Number(date.slice(0, 4)) ? Number(date.slice(0, 4)) - born : null;
    out.push({ event, date, days: daysBetween(today, date), turning });
  }
  return out.sort((a, b) => a.days - b.days || a.event.name.localeCompare(b.event.name));
}
