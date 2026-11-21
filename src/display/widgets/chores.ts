import type { ChoresData } from "@/lib/display/types";

import { refresh, send, subscribe } from "../api";
import { fill, h } from "../dom";
import type { Mount } from "./types";

// The chore chart (Melvin, 2026-11-21): a column for each kid with today's chores and the stars they've earned this
// week. A tap ticks a chore off at once, with a little star burst, and a second tap takes it back (a stray finger, or
// "I didn't really make my bed"). Other screens catch up within a minute.

export const CHORES_EVERY = 60_000;

type Person = ChoresData["people"][number];

/** The people a widget shows (none picked means everyone), each with today's chores in the chart's order. */
export function columns(data: ChoresData, personIds: string[], ticks: ReadonlyMap<string, boolean> = new Map()) {
  const chores = new Map(data.chores.map((c) => [c.id, c]));
  return data.people
    .filter((p) => personIds.length === 0 || personIds.includes(p.id))
    .map((p) => {
      let stars = p.stars;
      const items = data.due
        .filter((d) => d.personId === p.id)
        .flatMap((d) => {
          const chore = chores.get(d.choreId);
          if (!chore) return [];
          const key = `${d.choreId}|${p.id}`;
          const done = ticks.get(key) ?? d.done;
          // A tick this screen hasn't heard back about yet already counts towards the stars.
          if (done !== d.done) stars += done ? chore.stars : -chore.stars;
          return [{ key, chore, done }];
        });
      return { person: { ...p, stars: Math.max(0, stars) } as Person, items };
    });
}

export const chores: Mount<"chores"> = (el, w) => {
  const root = h("div", { class: "w-chores" }, h("div", { class: "w-empty" }, "Loading chores…"));
  el.append(root);
  let data: ChoresData | null = null;
  let message = "";
  let messageTimer: number | undefined;
  // Ticks made on this screen that the feed hasn't shown back yet (chore|person → done).
  const ticks = new Map<string, boolean>();

  const say = (text: string) => {
    message = text;
    draw();
    window.clearTimeout(messageTimer);
    if (text) messageTimer = window.setTimeout(() => say(""), 5000);
  };

  const celebrate = (key: string, stars: number, allDone: boolean) => {
    const item = root.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
    if (item) {
      const pop = h("span", { class: "ch-pop", "aria-hidden": "true" }, `+${stars} ⭐`);
      item.append(pop);
      window.setTimeout(() => pop.remove(), 1200);
    }
    const col = item?.closest<HTMLElement>(".ch-col");
    if (allDone && col) {
      const burst = h(
        "span",
        { class: "ch-burst", "aria-hidden": "true" },
        ...Array.from({ length: 8 }, (_, i) => h("i", { style: `--a:${i * 45}deg` }, "⭐")),
      );
      col.append(burst);
      window.setTimeout(() => burst.remove(), 1600);
    }
  };

  const tap = (choreId: string, personId: string, done: boolean, stars: number) => {
    const key = `${choreId}|${personId}`;
    ticks.set(key, done);
    draw();
    if (done) {
      const col = data ? columns(data, [personId], ticks)[0] : undefined;
      celebrate(key, stars, Boolean(col?.items.every((i) => i.done)));
    }
    void send("chores", { chore: choreId, person: personId, done }).then((ok) => {
      if (!ok) {
        ticks.delete(key);
        say("Couldn't save that. Try again in a moment.");
      }
      refresh("chores");
    });
  };

  function draw() {
    if (!data) return;
    const cols = columns(data, w.personIds, ticks);
    if (!cols.length)
      return fill(root, h("div", { class: "w-empty" }, "Add the kids and their chores under Settings › Chores in the admin panel."));
    fill(
      root,
      w.title ? h("div", { class: "w-label" }, w.title) : null,
      h(
        "div",
        { class: "ch-cols", style: `--n:${cols.length}` },
        ...cols.map(({ person: p, items }) => {
          const finished = items.length > 0 && items.every((i) => i.done);
          return h(
            "section",
            { class: `ch-col${finished ? " ch-finished" : ""}`, style: `--kid:${p.color}` },
            h(
              "div",
              { class: "ch-head" },
              h("span", { class: "ch-avatar", "aria-hidden": "true" }, p.emoji || p.name.slice(0, 1).toUpperCase()),
              h("span", { class: "ch-name" }, p.name),
              w.showStars ? h("span", { class: "ch-stars" }, `⭐ ${p.stars}${p.goal ? ` / ${p.goal}` : ""}`) : null,
            ),
            w.showStars && p.goal
              ? h("div", { class: "ch-bar" }, h("i", { style: `transform:scaleX(${Math.min(1, p.stars / p.goal)})` }))
              : null,
            items.length
              ? h(
                  "ul",
                  { class: "ch-list" },
                  ...items.map(({ key, chore, done }) => {
                    const parts = [
                      h("span", { class: "ch-check", "aria-hidden": "true" }, done ? "✓" : ""),
                      h("span", { class: "ch-title" }, chore.emoji ? `${chore.emoji} ${chore.name}` : chore.name),
                      w.showStars ? h("span", { class: "ch-worth" }, "★".repeat(chore.stars)) : null,
                    ];
                    const cls = `ch-item${done ? " ch-done" : ""}`;
                    if (!w.allowCheck) return h("li", { class: cls, "data-key": key }, ...parts);
                    const b = h("button", { type: "button", class: "ch-btn", "aria-pressed": done ? "true" : "false" }, ...parts);
                    b.addEventListener("click", (ev) => {
                      ev.stopPropagation();
                      tap(chore.id, p.id, !done, chore.stars);
                    });
                    return h("li", { class: cls, "data-key": key }, b);
                  }),
                )
              : h("div", { class: "ch-free" }, "No chores today"),
            finished ? h("div", { class: "ch-all" }, "All done! 🎉") : null,
          );
        }),
      ),
      message ? h("div", { class: "tk-msg" }, message) : null,
    );
  }

  const stopFeed = subscribe<ChoresData>("chores", CHORES_EVERY, (d) => {
    const dayChanged = data?.today !== d.today;
    data = d;
    // Forget ticks the feed now agrees with (and all of them on a new day).
    for (const [key, done] of ticks) {
      const row = d.due.find((x) => `${x.choreId}|${x.personId}` === key);
      if (dayChanged || !row || row.done === done) ticks.delete(key);
    }
    draw();
  });
  return () => {
    stopFeed();
    window.clearTimeout(messageTimer);
  };
};
