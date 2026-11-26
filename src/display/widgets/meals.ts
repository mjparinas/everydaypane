import { addDays, dayLabel } from "@/lib/calendar";
import type { MealsData } from "@/lib/display/types";
import { MEAL_ICONS, MEAL_LABELS, nextMeal } from "@/lib/meals";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import { fmt, isoDate } from "../format";
import { everyMinute } from "../ticker";
import type { Mount } from "./types";

// Meals (Melvin, 2026-11-17): breakfast, lunch and dinner from the family's meal plan. One day shows each meal large;
// more days list what's planned for each. The next meal is highlighted, and from 8 PM the widget starts at tomorrow,
// when "what's for breakfast?" is the question. The plan is checked every minute.

export const meals: Mount<"meals"> = (el, w, ctx) => {
  const root = h("div", { class: `w-meals${w.days === 1 ? " ml-one" : ""}` });
  el.append(root);
  let data: MealsData | null = null;
  let drawn = "";

  const draw = (now: Date) => {
    if (!data) return;
    const today = isoDate(now, ctx.timeZone);
    const next = nextMeal(Number(fmt(ctx.timeZone, { hour: "numeric", hourCycle: "h23" }).format(now)));
    const start = next.tomorrow ? addDays(today, 1) : today;
    const days = Array.from({ length: w.days }, (_, i) => addDays(start, i));
    const sig = JSON.stringify([days.map((d) => data?.meals[d]), today, next.slot]);
    if (sig === drawn) return;
    drawn = sig;

    const row = (date: string, slot: (typeof w.slots)[number], text: string | undefined) =>
      h(
        "div",
        { class: `ml-row${date === start && slot === next.slot ? " ml-next" : ""}${text ? "" : " ml-empty"}` },
        h("span", { class: "ml-slot" }, MEAL_ICONS[slot], " ", MEAL_LABELS[slot]),
        h("span", { class: "ml-text" }, text ?? "Not Planned"),
      );

    if (w.days === 1) {
      const plan = data.meals[start] ?? {};
      fill(
        root,
        h("div", { class: "w-label" }, w.title || (start === today ? "Today's Meals" : "Tomorrow's Meals")),
        ...w.slots.map((s) => row(start, s, plan[s])),
      );
      return;
    }
    fill(
      root,
      w.title ? h("div", { class: "w-label" }, w.title) : null,
      ...days.map((d) => {
        const plan = data?.meals[d] ?? {};
        const planned = w.slots.filter((s) => plan[s]);
        return h(
          "div",
          { class: `ml-day${d === today ? " ml-today" : ""}` },
          h("div", { class: "ml-date" }, dayLabel(d, today)),
          ...(planned.length ? planned.map((s) => row(d, s, plan[s])) : [h("div", { class: "ml-none" }, "Nothing planned")]),
        );
      }),
    );
  };

  const stopFeed = subscribe<MealsData>("meals", 60_000, (d) => {
    data = d;
    drawn = "";
    draw(new Date());
  });
  const stopTick = everyMinute(draw);
  return () => {
    stopFeed();
    stopTick();
  };
};
