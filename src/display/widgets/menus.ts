import type { MenusFeedData } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import type { Mount } from "./types";

const EVERY = 30 * 60_000;
const SLOT_LABEL = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" } as const;

export const menus: Mount<"menus"> = (el, w) => {
  const root = h("div", { class: "w-menus" }, h("div", { class: "w-empty" }, "Loading menus…"));
  el.append(root);
  return subscribe<MenusFeedData>("menus", EVERY, (feed) => {
    const data = feed.byWidget[w.id];
    if (!data) return fill(root, h("div", { class: "w-empty" }, "Set district slug under Settings › Menus."));
    const days = Object.entries(data.days).slice(0, w.days);
    if (!days.length) return fill(root, h("div", { class: "w-empty" }, "No menu posted yet."));
    const blocks = days.map(([date, meals]) => {
      const slots = w.slots.map((slot) => {
        const items = meals[slot];
        if (!items?.length) return null;
        return h(
          "div",
          { class: "mn-slot" },
          h("div", { class: "mn-slot-label" }, SLOT_LABEL[slot]),
          h("ul", { class: "mn-list" }, ...items.map((item) => h("li", {}, item))),
        );
      });
      return h("div", { class: "mn-day" }, h("div", { class: "mn-date" }, date), ...slots.filter(Boolean));
    });
    fill(
      root,
      h("div", { class: "w-label" }, w.title || data.school || "School menu"),
      ...blocks,
      data.stale ? h("div", { class: "mn-stale" }, "Last good menu") : null,
    );
  });
};
