import { addDays, dayLabel, localDate } from "@/lib/calendar";
import type { GarbageData } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import { fmt } from "../format";
import { everyMinute } from "../ticker";
import type { Mount } from "./types";

// Garbage day: the next pickup big ("Thursday: Garbage, Green cart"), the ones after it small. From 3 PM the day
// before a pickup it says to put the bins out tonight, which is when people actually need reminding.

const bins = (list: GarbageData["pickups"][number]["bins"]) =>
  h("div", { class: "gb-bins" }, ...list.map((b) => h("span", { class: `gb-bin gb-${b.kind}` }, b.name)));

export const garbage: Mount<"garbage"> = (el, w, ctx) => {
  const root = h("div", { class: "w-garbage" }, h("div", { class: "w-empty" }, "Checking the collection calendar…"));
  el.append(root);
  let data: GarbageData | null = null;
  let drawn = "";

  const draw = (now: Date) => {
    if (!data) return;
    if (!data.configured) return fill(root, h("div", { class: "w-empty" }, "Pick your address under Settings in the admin panel."));
    const today = localDate(now.getTime(), ctx.timeZone);
    const evening = Number(fmt(ctx.timeZone, { hour: "numeric", hourCycle: "h23" }).format(now)) >= 15;
    const sig = `${data.updatedAt}|${today}|${evening}`;
    if (sig === drawn) return;
    drawn = sig;

    const until = addDays(today, w.weeks * 7);
    const upcoming = data.pickups.filter((p) => p.date >= today && p.date < until);
    const [next, ...later] = upcoming;
    if (!next) return fill(root, h("div", { class: "w-empty" }, "No pickups in the next few weeks"));
    const tonight = next.date === addDays(today, 1) && evening;
    fill(
      root,
      h("div", { class: "w-label" }, w.title || "Garbage day"),
      h(
        "div",
        { class: `gb-next${tonight ? " gb-tonight" : ""}${next.date === today ? " gb-today" : ""}` },
        h("div", { class: "gb-when" }, tonight ? "Bins out tonight" : dayName(next.date, today)),
        bins(next.bins),
      ),
      later.length
        ? h(
            "ul",
            { class: "gb-later" },
            ...later.map((p) => h("li", {}, h("span", { class: "gb-date" }, dayLabel(p.date, today)), bins(p.bins))),
          )
        : null,
    );
  };

  const stopFeed = subscribe<GarbageData>("garbage", 60 * 60_000, (d) => {
    data = d;
    draw(new Date());
  });
  const stopTick = everyMinute(draw);
  return () => {
    stopFeed();
    stopTick();
  };
};

/** "Today", "Tomorrow", a weekday within the week, or a date further out. */
function dayName(date: string, today: string): string {
  if (date === today || date === addDays(today, 1) || date > addDays(today, 6)) return dayLabel(date, today);
  return fmt("UTC", { weekday: "long" }).format(Date.parse(`${date}T12:00:00Z`));
}
