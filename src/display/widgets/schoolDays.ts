import { dateInZone } from "@/lib/config/time";
import type { SchoolDaysData } from "@/lib/display/types";
import { addDays, lunchOn, schoolToday, upcomingDaysOff, type SchoolToday, type UpcomingOff } from "@/lib/schoolCalendar";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import { fmt } from "../format";
import type { Mount } from "./types";

// School days (Melvin, 2026-11-26): whether there's school today, tomorrow's day off, the next Pro-D days and breaks
// with how far away they are, and the weekly hot-lunch line. The server sends the year; today is worked out here, so
// the tile turns over at midnight between reads.
const EVERY = 30 * 60_000;
const TICK = 5 * 60_000;

// School dates are calendar days, so they are written in UTC (a Vancouver time zone would never shift a date, but a
// screen's own zone could).
const longDay = fmt("UTC", { weekday: "long", month: "short", day: "numeric" });
const shortDay = fmt("UTC", { weekday: "short", month: "short", day: "numeric" });
const at = (date: string) => Date.parse(`${date}T12:00:00Z`);

export function daysAway(today: string, date: string): string {
  const n = Math.round((at(date) - at(today)) / 86_400_000);
  return n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
}

export function rangeText(o: UpcomingOff): string {
  if (o.start === o.end) return shortDay.format(at(o.start));
  return `${shortDay.format(at(o.start))} – ${shortDay.format(at(o.end))}`;
}

/** The big line and the one under it. */
export function todayLines(t: SchoolToday, lunch: string): { main: string; cls: string; sub: string } {
  switch (t.state) {
    case "school": {
      const sub = [
        t.early ?? "",
        lunch ? `Lunch: ${lunch}` : "",
        t.lastDay ? "Last Day of School" : t.firstDay ? "First Day of School" : "",
      ];
      return { main: "School Today", cls: t.early ? "sd-early" : "sd-school", sub: sub.filter(Boolean).join(" · ") };
    }
    case "weekend":
      return { main: "No School", cls: "sd-off", sub: "Weekend" };
    case "off":
      return {
        main: "No School Today",
        cls: "sd-off",
        sub: [t.name, t.backOn ? `back ${longDay.format(at(t.backOn))}` : ""].filter(Boolean).join(" · "),
      };
    case "summer":
      return { main: "Summer Holidays", cls: "sd-off", sub: t.backOn ? `School starts ${longDay.format(at(t.backOn))}` : "" };
  }
}

/** A line about tomorrow when it isn't an ordinary school day after an ordinary one. */
export function tomorrowLine(today: SchoolToday, tomorrow: SchoolToday, lunch: string): string {
  if (tomorrow.state === "off" && today.state !== "off") return `Tomorrow: no school (${tomorrow.name})`;
  if (tomorrow.state === "school") {
    if (tomorrow.early) return `Tomorrow: ${tomorrow.early.toLowerCase()}`;
    if (tomorrow.firstDay) return "Tomorrow: first day of school";
    if (today.state === "off" || today.state === "summer") return `Back to school tomorrow${lunch ? ` · Lunch: ${lunch}` : ""}`;
    if (lunch) return `Tomorrow's lunch: ${lunch}`;
  }
  return "";
}

export const schoolDays: Mount<"schoolDays"> = (el, w, ctx) => {
  const root = h("div", { class: "w-schoolDays" }, h("div", { class: "w-empty" }, "Loading school days…"));
  el.append(root);
  let data: SchoolDaysData | null = null;

  const draw = () => {
    if (!data) return;
    const d = data;
    const label = h("div", { class: "w-label" }, w.title || d.calendarName || "School");
    if (!d.firstDay && !d.lastDay && !d.daysOff.length)
      return fill(root, label, h("div", { class: "w-empty" }, "Add the school year under Household Settings › School days"));
    const today = dateInZone(new Date(), ctx.timeZone);
    const tomorrow = addDays(today, 1);
    const lunch = (date: string) => (w.showLunch ? lunchOn(d.lunches, date) : "");
    const now = schoolToday(d, today);
    const lines = todayLines(now, lunch(today));
    const next = tomorrowLine(now, schoolToday(d, tomorrow), lunch(tomorrow));
    // Today's own day off is already the big line, so the list starts after it.
    const list = w.count ? upcomingDaysOff(d, now.state === "off" ? (now.backOn ?? today) : today, w.count) : [];
    fill(
      root,
      label,
      h("div", { class: `sd-state ${lines.cls}` }, lines.main),
      lines.sub ? h("div", { class: "sd-sub" }, lines.sub) : null,
      next ? h("div", { class: "sd-next" }, next) : null,
      list.length
        ? h(
            "ul",
            { class: "sd-list" },
            ...list.map((o) =>
              h(
                "li",
                { class: `sd-row${o.weekdays >= 3 ? " sd-break" : ""}` },
                h("span", { class: "sd-name" }, o.name),
                h("span", { class: "sd-when" }, o.name === "Summer Holidays" ? `from ${rangeText({ ...o, end: o.start })}` : rangeText(o)),
                h("span", { class: "sd-away" }, daysAway(today, o.start)),
              ),
            ),
          )
        : null,
      d.error ? h("div", { class: "sd-error" }, d.error) : null,
    );
  };

  const stop = subscribe<SchoolDaysData>("school-days", EVERY, (d) => {
    data = d;
    draw();
  });
  const timer = setInterval(draw, TICK);
  return () => {
    stop();
    clearInterval(timer);
  };
};
