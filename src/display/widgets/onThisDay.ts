import type { OnThisDayData } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import type { Mount } from "./types";

// On this day (Melvin, 2026-11-25), from Wikipedia through our server. Loads on its own (src/display/widgets/lazy.ts).
// The server picks the day's order, so every screen shows the same items until midnight.

export const onThisDay: Mount<"onThisDay"> = (el, w) => {
  const root = h("div", { class: "w-otd" }, h("div", { class: "w-empty" }, "Loading…"));
  el.append(root);
  const path = `on-this-day?kind=${w.kind}&safe=${w.familyFriendly ? "1" : "0"}`;
  return subscribe<OnThisDayData>(path, 60 * 60_000, (d) => {
    const items = d.items.slice(0, w.count);
    if (!items.length) return fill(root, h("div", { class: "w-empty" }, d.error ?? "Nothing for today."));
    const thisYear = Number(d.date.slice(0, 4));
    fill(
      root,
      h("div", { class: "w-label" }, w.title || (w.kind === "births" ? "Born on This Day" : "On This Day")),
      h(
        "ul",
        { class: `otd-list${items.length === 1 ? " otd-one" : ""}` },
        ...items.map((i) =>
          h(
            "li",
            { class: "otd-item" },
            h("span", { class: "otd-year" }, i.year < 0 ? `${-i.year} BC` : String(i.year)),
            h("span", { class: "otd-text" }, i.text),
            items.length === 1 && thisYear > i.year ? h("span", { class: "otd-ago" }, `${thisYear - i.year} years ago`) : null,
          ),
        ),
      ),
    );
  });
};
