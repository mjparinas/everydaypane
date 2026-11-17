import type { BoardMessage } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import { everyMinute } from "../ticker";
import type { Mount } from "./types";

/** "just now", "5 min", "3 h", "2 d": short enough for a sticky note's corner. */
export function ago(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h`;
  return `${Math.floor(hr / 24)} d`;
}

// The family message board: the newest notes (pinned first), checked every 30 seconds, which is as quick as admin
// changes reach a display (Melvin, 2026-11-17: polling is fine).
export const messages: Mount<"messages"> = (el, w) => {
  const root = h("div", { class: "w-messages" });
  el.append(root);
  let list: BoardMessage[] | null = null; // null until the first answer, so an empty board doesn't flash
  const draw = (now: number) => {
    if (!list) return;
    const shown = list.slice(0, w.count);
    if (!shown.length) {
      fill(
        root,
        w.title ? h("div", { class: "w-label" }, w.title) : null,
        h("div", { class: "w-empty" }, "No notes yet. Post one from your phone."),
      );
      return;
    }
    fill(
      root,
      w.title ? h("div", { class: "w-label" }, w.title) : null,
      ...shown.map((m) =>
        h(
          "div",
          { class: `msg msg-${m.colour}${m.pinned ? " msg-pinned" : ""}` },
          h("div", { class: "msg-text" }, m.text),
          h("div", { class: "msg-meta" }, m.pinned ? "📌 " : "", m.author, " · ", ago(now - m.createdAt)),
        ),
      ),
    );
  };
  const stopFeed = subscribe<{ messages: BoardMessage[] }>("messages", 30_000, (data) => {
    list = data.messages;
    draw(Date.now());
  });
  // Keeps "5 min" honest between polls.
  const stopTick = everyMinute((now) => draw(now.getTime()));
  return () => {
    stopFeed();
    stopTick();
  };
};
