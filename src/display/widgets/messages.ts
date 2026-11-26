import type { BoardMessage } from "@/lib/display/types";

import { refresh, send, subscribe } from "../api";
import { dropOverflow, fill, h, keepFitted } from "../dom";
import { everyMinute } from "../ticker";
import type { Mount } from "./types";

const COLOURS = ["yellow", "pink", "blue", "green", "purple"] as const;

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
  let list: BoardMessage[] | null = null;
  let message = "";
  let colour: (typeof COLOURS)[number] = "yellow";

  const fit = () => dropOverflow(root, ".msg");
  const draw = (now: number) => {
    if (!list) return;
    const shown = list.slice(0, w.count);
    const note = message ? h("div", { class: "msg-flash" }, message) : null;
    if (!shown.length) {
      fill(
        root,
        w.title ? h("div", { class: "w-label" }, w.title) : null,
        h(
          "div",
          { class: "w-empty" },
          w.allowAdd ? "No notes yet — add one below, or from a phone." : "No notes yet. Post one from your phone.",
        ),
        w.allowAdd ? buildAdd() : null,
        note,
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
      w.allowAdd ? buildAdd() : null,
      note,
    );
    fit();
  };

  const buildAdd = () => {
    const author = h("input", { type: "text", class: "msg-in", maxlength: "30", placeholder: "Name" }) as HTMLInputElement;
    const text = h("input", { type: "text", class: "msg-in msg-wide", maxlength: "280", placeholder: "Note…" }) as HTMLInputElement;
    const chips = h(
      "div",
      { class: "msg-chips" },
      ...COLOURS.map((c) => {
        const b = h("button", {
          type: "button",
          class: `msg-chip msg-chip-${c}${colour === c ? " on" : ""}`,
          "aria-pressed": colour === c ? "true" : "false",
        });
        b.addEventListener("click", (ev) => {
          ev.stopPropagation();
          colour = c;
          draw(Date.now());
        });
        return b;
      }),
    );
    const post = h("button", { type: "button", class: "msg-post" }, "Post");
    post.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const a = author.value.trim();
      const t = text.value.trim();
      if (!a || !t) {
        message = "Name and note required.";
        draw(Date.now());
        window.setTimeout(() => {
          message = "";
          draw(Date.now());
        }, 4000);
        return;
      }
      author.value = "";
      text.value = "";
      void send("messages", { author: a, text: t, colour }).then((ok) => {
        if (!ok) message = "Couldn't post. Try again.";
        else refresh("messages");
        draw(Date.now());
      });
    });
    return h("div", { class: "msg-compose" }, author, text, chips, post);
  };

  const stopFeed = subscribe<{ messages: BoardMessage[] }>("messages", 30_000, (data) => {
    list = data.messages;
    draw(Date.now());
  });
  const stopTick = everyMinute((now) => draw(now.getTime()));
  const stopFit = keepFitted(el, fit);
  return () => {
    stopFeed();
    stopTick();
    stopFit();
  };
};
