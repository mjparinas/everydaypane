import { h, setText } from "../dom";
import { fmt } from "../format";
import { everyMinute } from "../ticker";
import type { Mount } from "./types";

export const date: Mount<"date"> = (el, w) => {
  const day = h("div", { class: "d-day" });
  const rest = h("div", { class: "d-rest" });
  el.append(h("div", { class: "w-date" }, w.title ? h("div", { class: "w-label" }, w.title) : null, day, rest));
  const weekday = fmt(w.timeZone, { weekday: "long" });
  const monthDay = fmt(w.timeZone, w.showYear ? { month: "long", day: "numeric", year: "numeric" } : { month: "long", day: "numeric" });
  return everyMinute((now) => {
    setText(day, weekday.format(now));
    setText(rest, monthDay.format(now));
  });
};
