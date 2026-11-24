import type { ShoppingData, ShoppingItem } from "@/lib/display/types";

import { refresh, send, subscribe } from "../api";
import { fill, h } from "../dom";
import type { Mount } from "./types";

// The shopping list (Melvin, 2026-11-22): what the family added from their phones. A tap ticks an item off at once,
// and a second tap puts it back. Other screens catch up within a minute.

export const SHOPPING_EVERY = 60_000;

/** Open items first (server order kept), then bought ones when the widget shows them. */
export function listedItems(data: ShoppingData, showDone: boolean, ticks: ReadonlyMap<string, boolean> = new Map()): ShoppingItem[] {
  const items = data.items.map((item) => {
    const done = ticks.get(item.id);
    return done === undefined ? item : { ...item, done };
  });
  const open = items.filter((i) => !i.done);
  return showDone ? [...open, ...items.filter((i) => i.done)] : open;
}

/** `listedItems`, cut to how many rows the widget has room for. */
export function shownItems(
  data: ShoppingData,
  count: number,
  showDone: boolean,
  ticks: ReadonlyMap<string, boolean> = new Map(),
): ShoppingItem[] {
  return listedItems(data, showDone, ticks).slice(0, Math.max(0, count));
}

export const shopping: Mount<"shopping"> = (el, w) => {
  const root = h("div", { class: "w-shopping" }, h("div", { class: "w-empty" }, "Loading the list…"));
  el.append(root);
  let data: ShoppingData | null = null;
  let message = "";
  let messageTimer: number | undefined;
  // Ticks made on this screen that the feed hasn't shown back yet (id → done).
  const ticks = new Map<string, boolean>();

  const say = (text: string) => {
    message = text;
    draw();
    window.clearTimeout(messageTimer);
    if (text) messageTimer = window.setTimeout(() => say(""), 5000);
  };

  const tap = (id: string, done: boolean) => {
    ticks.set(id, done);
    draw();
    void send("shopping", { id, done }).then((ok) => {
      if (!ok) {
        ticks.delete(id);
        say("Couldn't save that. Try again in a moment.");
      }
      refresh("shopping");
    });
  };

  function draw() {
    if (!data) return;
    const all = listedItems(data, w.showDone, ticks);
    const items = all.slice(0, w.count);
    const more = all.length - items.length;
    const title = w.title ? h("div", { class: "w-label" }, w.title) : null;
    const note = message ? h("div", { class: "sh-msg" }, message) : null;
    if (!items.length) {
      const bought = data.items.some((i) => (ticks.get(i.id) ?? i.done) === true);
      // Keep Add on empty lists when the wall allows it (W2, 2026-11-24) — otherwise an empty tile looks stuck.
      return fill(
        root,
        title,
        h("div", { class: "w-empty" }, bought && !w.showDone ? "All bought" : "Nothing on the list"),
        w.allowAdd ? buildAdd() : null,
        note,
      );
    }
    fill(
      root,
      title,
      h(
        "ul",
        { class: "sh-items" },
        ...items.map((item) => {
          const parts = [
            h("span", { class: "sh-check", "aria-hidden": "true" }, item.done ? "✓" : ""),
            h("span", { class: "sh-title" }, item.text),
          ];
          const cls = `sh-item${item.done ? " sh-done" : ""}`;
          if (!w.allowCheck) return h("li", { class: cls, "data-id": item.id }, ...parts);
          const b = h("button", { type: "button", class: "sh-btn", "aria-pressed": item.done ? "true" : "false" }, ...parts);
          b.addEventListener("click", (ev) => {
            ev.stopPropagation();
            tap(item.id, !item.done);
          });
          return h("li", { class: cls, "data-id": item.id }, b);
        }),
      ),
      more > 0 ? h("div", { class: "sh-more" }, `${more} more`) : null,
      w.allowAdd ? buildAdd() : null,
      note,
    );
  }

  const buildAdd = () => {
    const input = h("input", { type: "text", class: "sh-add-in", maxlength: "80", placeholder: "Add to the list…" }) as HTMLInputElement;
    const btn = h("button", { type: "button", class: "sh-add-btn" }, "Add");
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const text = input.value;
      if (!text.trim()) return;
      input.value = "";
      void send("shopping", { text }).then((ok) => {
        if (!ok) say("Couldn't add that. Try again.");
        else refresh("shopping");
      });
    });
    return h("div", { class: "sh-add" }, input, btn);
  };

  const stopFeed = subscribe<ShoppingData>("shopping", SHOPPING_EVERY, (d) => {
    data = d;
    for (const [id, done] of ticks) {
      const row = d.items.find((x) => x.id === id);
      if (!row || row.done === done) ticks.delete(id);
    }
    draw();
  });
  return () => {
    stopFeed();
    window.clearTimeout(messageTimer);
  };
};
