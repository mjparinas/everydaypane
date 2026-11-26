import { celebration, milestone, upcoming, type UpcomingEvent } from "@/lib/config/countdown";

import { imageUrl } from "../api";
import { fill, h } from "../dom";
import { isoDate } from "../format";
import { everyMinute } from "../ticker";
import type { Mount } from "./types";

const EMOJI: Record<string, string> = { birthday: "🎂", anniversary: "💍", holiday: "📅", event: "📅" };

// A date's photo (Melvin, 2026-11-26) is a small round picture in place of its emoji, shrunk to about 800 px when it
// was uploaded; a broken one falls back to the emoji so the row never shows an empty box.
function badge(u: UpcomingEvent, cls: string): HTMLElement {
  const emoji = u.event.emoji || EMOJI[u.event.kind] || "📅";
  if (!u.event.photo) return h("span", { class: "cd-emoji", "aria-hidden": "true" }, emoji);
  const img = h("img", {
    class: cls,
    src: imageUrl("countdown-photo", { i: u.event.photo }),
    alt: "",
    decoding: "async",
    loading: "lazy",
  }) as HTMLImageElement;
  img.addEventListener("error", () => img.replaceWith(h("span", { class: "cd-emoji", "aria-hidden": "true" }, emoji)), { once: true });
  return img;
}

function row(u: UpcomingEvent, first: boolean): HTMLElement {
  const extra = milestone(u);
  return h(
    "div",
    { class: `cd-row${first ? " cd-first" : ""}` },
    badge(u, "cd-photo"),
    h("span", { class: "cd-name" }, u.event.name, extra ? h("span", { class: "cd-turning" }, ` ${extra}`) : null),
    h(
      "span",
      { class: "cd-days" },
      u.days === 0 ? "Today!" : u.days === 1 ? "Tomorrow" : h("span", {}, h("b", {}, String(u.days)), " days"),
    ),
  );
}

// On the day itself the event leads the tile, with its photo large (`celebrate`, on by default).
function hero(u: UpcomingEvent): HTMLElement {
  const extra = milestone(u);
  return h(
    "div",
    { class: `cd-hero${u.event.photo ? " cd-hero-photo" : ""}` },
    badge(u, "cd-hero-img"),
    h(
      "div",
      { class: "cd-hero-text" },
      h("div", { class: "cd-hero-title" }, celebration(u)),
      extra ? h("div", { class: "cd-hero-sub" }, `${extra} today`) : null,
    ),
  );
}

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
      fill(root, h("div", { class: "w-empty" }, "Add birthdays, anniversaries and holidays in this widget's settings."));
      return;
    }
    const celebrating = w.celebrate !== false ? list.filter((u) => u.days === 0) : [];
    const rest = list.filter((u) => !celebrating.includes(u));
    fill(
      root,
      w.title ? h("div", { class: "w-label" }, w.title) : null,
      ...celebrating.map(hero),
      ...rest.map((u, i) => row(u, i === 0 && !celebrating.length)),
    );
  });
};
