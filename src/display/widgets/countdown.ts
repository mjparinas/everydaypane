import { upcoming } from "@/lib/config/countdown";

import { fill, h } from "../dom";
import { isoDate } from "../format";
import { everyMinute } from "../ticker";
import type { Mount } from "./types";

export const countdown: Mount<"countdown"> = (el, w, ctx) => {
  const root = h("div", { class: "w-countdown" });
  el.append(root);
  let lastDay = "";
  return everyMinute((now) => {
    const today = isoDate(now, ctx.timeZone);
    if (today === lastDay) return;
    lastDay = today;
    const list = upcoming(w.events, today).slice(0, w.count);
    if (!list.length) {
      fill(root, h("div", { class: "w-empty" }, "Add holidays and birthdays under Settings."));
      return;
    }
    fill(
      root,
      w.title ? h("div", { class: "w-label" }, w.title) : null,
      ...list.map((u, i) =>
        h(
          "div",
          { class: `cd-row${i === 0 ? " cd-first" : ""}` },
          h("span", { class: "cd-emoji", "aria-hidden": "true" }, u.event.emoji || (u.event.kind === "birthday" ? "🎂" : "📅")),
          h("span", { class: "cd-name" }, u.event.name, u.turning ? h("span", { class: "cd-turning" }, ` turns ${u.turning}`) : null),
          h(
            "span",
            { class: "cd-days" },
            u.days === 0 ? "Today!" : u.days === 1 ? "Tomorrow" : h("span", {}, h("b", {}, String(u.days)), " days"),
          ),
        ),
      ),
    );
  });
};
