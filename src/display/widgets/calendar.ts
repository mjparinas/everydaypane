import { addDays, byDay, dayLabel, eventTime, isWeekend, localDate, monthGrid, weeksFrom } from "@/lib/calendar";
import type { CalendarData, CalendarEvent } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import { fmt } from "../format";
import { everyMinute } from "../ticker";
import type { Mount } from "./types";

// The today schedule and the month view. Both share one calendar feed (refreshed every five minutes) and redraw once a
// minute only when something they show has changed (an event ending, or midnight).

const FEED = "calendar";
const EVERY = 5 * 60_000;

const notConnected = () => h("div", { class: "w-empty" }, "Connect Google Calendar in the admin panel.");

function row(e: CalendarEvent, date: string, ctx: { timeZone: string; hour12: boolean }, now: number) {
  const past = !e.allDay && Date.parse(e.end) <= now;
  return h(
    "li",
    { class: `ag-row${past ? " ag-past" : ""}` },
    h("span", { class: "ag-dot", style: `background:${e.color}`, "aria-hidden": "true" }),
    h("span", { class: "ag-time" }, eventTime(e, date, ctx.timeZone, ctx.hour12)),
    h("span", { class: "ag-title" }, e.title, e.location ? h("span", { class: "ag-where" }, ` · ${e.location}`) : null),
  );
}

export const agenda: Mount<"agenda"> = (el, w, ctx) => {
  const root = h("div", { class: "w-agenda" }, h("div", { class: "w-empty" }, "Loading the calendar…"));
  el.append(root);
  let data: CalendarData | null = null;
  let drawn = "";

  const draw = (now: number) => {
    if (!data) return;
    if (data.connected === false) return fill(root, notConnected());
    const today = localDate(now, ctx.timeZone);
    const days = byDay(data.events, ctx.timeZone);
    const dates = w.range === "today" ? [today] : Array.from({ length: w.days }, (_, i) => addDays(today, i));
    // Skip the redraw when nothing visible changed (same data, same day, no event has ended since).
    const ended = data.events.filter((e) => !e.allDay && Date.parse(e.end) <= now).length;
    const sig = `${data.updatedAt}|${today}|${ended}`;
    if (sig === drawn) return;
    drawn = sig;

    const groups = dates.map((d) => ({ d, list: days.get(d) ?? [] })).filter((g, i) => g.list.length || (w.range === "today" && i === 0));
    if (!groups.some((g) => g.list.length)) {
      fill(
        root,
        w.title ? h("div", { class: "w-label" }, w.title) : null,
        h("div", { class: "w-empty ag-free" }, w.range === "today" ? "Nothing on today" : "Nothing coming up"),
      );
      return;
    }
    fill(
      root,
      w.title ? h("div", { class: "w-label" }, w.title) : null,
      ...groups.map((g) =>
        h(
          "section",
          { class: "ag-day" },
          // Only the upcoming range needs a day label; for today the widget title (or the range itself) already says it.
          w.range === "upcoming" ? h("h3", { class: "ag-head" }, dayLabel(g.d, today)) : null,
          h("ul", { class: "ag-list" }, ...g.list.map((e) => row(e, g.d, ctx, now))),
        ),
      ),
    );
  };

  const stopFeed = subscribe<CalendarData>(FEED, EVERY, (d) => {
    data = d;
    draw(Date.now());
  });
  const stopTick = everyMinute((now) => draw(now.getTime()));
  return () => {
    stopFeed();
    stopTick();
  };
};

export const calendarMonth: Mount<"calendarMonth"> = (el, w, ctx) => {
  const root = h("div", { class: "w-month" }, h("div", { class: "w-empty" }, "Loading the calendar…"));
  el.append(root);
  let data: CalendarData | null = null;
  let drawn = "";

  const draw = (now: number) => {
    if (!data) return;
    if (data.connected === false) return fill(root, notConnected());
    const today = localDate(now, ctx.timeZone);
    const sig = `${data.updatedAt}|${today}|${el.clientHeight}`;
    if (sig === drawn) return;
    drawn = sig;

    // Whole month (the default) or a rolling run of weeks starting with this one; weekends dropped if switched off.
    const rolling = w.weeks !== undefined;
    const weeks = (rolling ? weeksFrom(today, w.weekStartsOn, w.weeks ?? 1) : monthGrid(today, w.weekStartsOn)).map((wk) =>
      w.showWeekends ? wk : wk.filter((d) => !isWeekend(d)),
    );
    const days = byDay(data.events, ctx.timeZone);
    const month = today.slice(0, 7);
    const weekdayNames = (weeks[0] ?? []).map((d) => fmt("UTC", { weekday: "short" }).format(Date.parse(`${d}T12:00:00Z`)));
    const cols = w.showWeekends ? "mo-grid" : "mo-grid mo-5";

    fill(
      root,
      w.showTitle ? h("div", { class: "mo-title" }, w.title || monthTitle(today, rolling ? weeks.flat() : [today])) : null,
      h("div", { class: `${cols} mo-names`, "aria-hidden": "true" }, ...weekdayNames.map((n) => h("div", { class: "mo-name" }, n))),
      h(
        "div",
        { class: `${cols} mo-days`, style: `grid-template-rows:repeat(${weeks.length},minmax(0,1fr))` },
        ...weeks.flat().map((d) => {
          const list = days.get(d) ?? [];
          return h(
            "div",
            {
              class: `mo-day${!rolling && d.slice(0, 7) !== month ? " mo-out" : ""}${d === today ? " mo-today" : ""}${d < today ? " mo-past" : ""}`,
            },
            // In rolling weeks the first of a month says which month it starts ("Dec 1").
            h("div", { class: "mo-num" }, rolling && d.endsWith("-01") ? shortDate(d) : String(Number(d.slice(8)))),
            ...list.map((e) =>
              h(
                "div",
                { class: `mo-ev${e.allDay ? " mo-all" : ""}`, style: `--c:${e.color}` },
                e.allDay ? null : h("span", { class: "mo-t" }, eventTime(e, d, ctx.timeZone, ctx.hour12).replace(/^Until /, "→")),
                e.title,
              ),
            ),
          );
        }),
      ),
    );
    for (const day of root.querySelectorAll<HTMLElement>(".mo-day")) trimDay(day);
  };

  const stopFeed = subscribe<CalendarData>(FEED, EVERY, (d) => {
    data = d;
    draw(Date.now());
  });
  const stopTick = everyMinute((now) => draw(now.getTime()));
  return () => {
    stopFeed();
    stopTick();
  };
};

const noon = (d: string) => Date.parse(`${d}T12:00:00Z`);
const shortDate = (d: string) => fmt("UTC", { month: "short", day: "numeric" }).format(noon(d));

/** "November 2026", or "November – December 2026" when the shown days run into the next month. */
function monthTitle(today: string, shown: string[]): string {
  const first = shown[0] ?? today;
  const last = shown[shown.length - 1] ?? today;
  const long = (d: string, year: boolean) => fmt("UTC", year ? { month: "long", year: "numeric" } : { month: "long" }).format(noon(d));
  if (first.slice(0, 7) === last.slice(0, 7)) return long(first, true);
  return `${long(first, first.slice(0, 4) !== last.slice(0, 4))} – ${long(last, true)}`;
}

/**
 * Drops the events that don't fit in a day's box and says how many are hidden. Measured once per redraw (a few times
 * an hour at most), which is cheaper and more accurate than guessing line heights for every screen size.
 */
function trimDay(day: HTMLElement): void {
  const events = [...day.querySelectorAll<HTMLElement>(".mo-ev")];
  if (!events.length || day.scrollHeight <= day.clientHeight) return;
  const colours = events.slice(0, 4).map((e) => e.style.getPropertyValue("--c"));
  let hidden = 0;
  const more = h("div", { class: "mo-more" });
  day.append(more);
  while (events.length && day.scrollHeight > day.clientHeight) {
    events.pop()?.remove();
    hidden++;
    more.textContent = `+${hidden} more`;
  }
  if (!events.length) {
    // Not even one line fits: coloured dots show that something is on.
    more.replaceWith(h("div", { class: "mo-dots" }, ...colours.map((c) => h("i", { style: `background:${c}` }))));
  }
}
