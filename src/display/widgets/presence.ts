import type { HaData } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import { HA_EVERY } from "./ha";
import type { Mount } from "./types";

// Who's home (Melvin, 2026-11-22): Home Assistant person and device tracker entities, from the same feed as the other
// tiles. Read only: a tap here does nothing.

/** Where someone is, as the wall says it. "home" and a presence sensor that's on count as home. */
export function presenceWhere(state: string): { home: boolean; where: string } {
  const s = state.toLowerCase();
  if (s === "home" || s === "on") return { home: true, where: "Home" };
  if (s === "not_home" || s === "off") return { home: false, where: "Away" };
  if (s === "unavailable" || s === "unknown" || s === "") return { home: false, where: "Unavailable" };
  return { home: false, where: state.charAt(0).toUpperCase() + state.slice(1).replace(/_/g, " ") };
}

export const presence: Mount<"presence"> = (el, w) => {
  const root = h("div", { class: "w-presence" }, h("div", { class: "w-empty" }, "Checking who's home…"));
  el.append(root);
  return subscribe<HaData>("ha", HA_EVERY, (d) => {
    if (!d.configured) return fill(root, h("div", { class: "w-empty" }, "Set up Home Assistant under Settings."));
    if (w.entities.length === 0) return fill(root, h("div", { class: "w-empty" }, "Pick people for this widget."));
    fill(
      root,
      h("div", { class: "w-label" }, w.title || "Who's home"),
      h(
        "ul",
        { class: "pr-list" },
        ...w.entities.map((person) => {
          const entity = d.entities[person.entityId];
          const name = person.label.trim() || entity?.name || "Someone";
          if (!entity) {
            return h(
              "li",
              { class: "pr-row pr-away" },
              h("span", { class: "pr-dot" }),
              h("span", { class: "pr-name" }, name),
              h("span", { class: "pr-where" }, "Unknown"),
            );
          }
          const where = presenceWhere(entity.state);
          return h(
            "li",
            { class: `pr-row ${where.home ? "pr-home" : "pr-away"}` },
            h("span", { class: "pr-dot" }),
            h("span", { class: "pr-name" }, name),
            h("span", { class: "pr-where" }, where.where),
          );
        }),
      ),
    );
  });
};
