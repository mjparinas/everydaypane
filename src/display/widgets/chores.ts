import { activePeriod, PERIOD_LABELS, periodRank } from "@/lib/chores";
import type { ChorePeriod } from "@/lib/config/schema";
import type { ChoresData } from "@/lib/display/types";

import { refresh, sendExplained, subscribe } from "../api";
import { fill, h } from "../dom";
import { attachModal } from "../modal";
import type { Mount } from "./types";

// The chore chart (Melvin, 2026-11-21): a column for each kid with today's chores and the stars they've earned this
// week. A tap ticks a chore off at once, with a little star burst, and a second tap takes it back (a stray finger, or
// "I didn't really make my bed"). Other screens catch up within a minute.
// Periods and progress dots (Melvin, 2026-11-23: homescreens-style morning/afternoon/evening bands).

export const CHORES_EVERY = 60_000;

type Person = ChoresData["people"][number];
type ChoreRow = ChoresData["chores"][number];
type Item = { key: string; chore: ChoreRow; done: boolean };

/** The people a widget shows (none picked means everyone), each with today's chores in period then chart order. */
export function columns(data: ChoresData, personIds: string[], ticks: ReadonlyMap<string, boolean> = new Map()) {
  const chores = new Map(data.chores.map((c) => [c.id, c]));
  return data.people
    .filter((p) => personIds.length === 0 || personIds.includes(p.id))
    .map((p) => {
      let stars = p.stars;
      let available = p.available;
      const items = data.due
        .filter((d) => d.personId === p.id)
        .flatMap((d) => {
          const chore = chores.get(d.choreId);
          if (!chore) return [];
          const key = `${d.choreId}|${p.id}`;
          const done = ticks.get(key) ?? d.done;
          // A tick this screen hasn't heard back about yet already counts towards the stars.
          if (done !== d.done) {
            const delta = done ? chore.stars : -chore.stars;
            stars += delta;
            available += delta;
          }
          return [{ key, chore, done }];
        })
        .sort((a, b) => periodRank(a.chore.period) - periodRank(b.chore.period) || a.chore.name.localeCompare(b.chore.name));
      return { person: { ...p, stars: Math.max(0, stars), available: Math.max(0, available) } as Person, items };
    });
}

/** Group a person's items into period bands (empty bands omitted). */
export function bandsFor(items: Item[]): { period: ChorePeriod; items: Item[] }[] {
  const by = new Map<ChorePeriod, Item[]>();
  for (const item of items) {
    const list = by.get(item.chore.period) ?? [];
    list.push(item);
    by.set(item.chore.period, list);
  }
  return (["morning", "afternoon", "evening", "anytime"] as const)
    .filter((p) => (by.get(p)?.length ?? 0) > 0)
    .map((period) => ({ period, items: by.get(period)! }));
}

function hourInZone(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, hour: "numeric", hourCycle: "h23" }).formatToParts(now);
  return Number(parts.find((p) => p.type === "hour")?.value ?? "12");
}

export const chores: Mount<"chores"> = (el, w, ctx) => {
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

  const withPin = (need: boolean, next: (pin?: string) => void) => {
    if (!need) return next();
    let entry = "";
    const pad = h("div", { class: "ch-pin" }, h("p", {}, "Enter PIN"));
    const keys = h("div", { class: "ch-pin-keys" });
    const done = () => {
      detach();
      pad.remove();
      next(entry.length === 4 ? entry : undefined);
    };
    const add = (d: string) => {
      if (entry.length >= 4) return;
      entry += d;
      if (entry.length === 4) done();
    };
    for (const d of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"]) {
      const b = h("button", { type: "button" }, d);
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (d === "⌫") entry = entry.slice(0, -1);
        else if (d === "OK") done();
        else add(d);
      });
      keys.append(b);
    }
    pad.append(keys);
    root.append(pad);
    const detach = attachModal(pad, () => {
      pad.remove();
      detach();
      next();
    });
  };

  const post = (body: Record<string, unknown>) => {
    void sendExplained("chores", body).then((err) => {
      if (err === null) refresh("chores");
      else say(err || "Couldn't save that. Try again in a moment.");
    });
  };

  const tap = (choreId: string, personId: string, done: boolean, stars: number) => {
    const key = `${choreId}|${personId}`;
    const needPin = Boolean(!done && data?.pinSet);
    withPin(needPin, (pin) => {
      if (needPin && !pin) return;
      ticks.set(key, done);
      draw();
      if (done) {
        const col = data ? columns(data, [personId], ticks)[0] : undefined;
        celebrate(key, stars, Boolean(col?.items.every((i) => i.done)));
      }
      const payload: Record<string, unknown> = { chore: choreId, person: personId, done };
      if (pin) payload.pin = pin;
      void sendExplained("chores", payload).then((err) => {
        if (err !== null) {
          ticks.delete(key);
          say(err || "Couldn't save that. Try again in a moment.");
        }
        refresh("chores");
      });
    });
  };

  const redeem = (rewardId: string, personId: string) => {
    withPin(Boolean(data?.pinSet), (pin) => {
      if (data?.pinSet && !pin) return;
      const payload: Record<string, unknown> = { redeem: rewardId, person: personId };
      if (pin) payload.pin = pin;
      post(payload);
    });
  };

  const itemRow = (p: Person, { key, chore, done }: Item) => {
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
  };

  const dots = (items: Item[]) => {
    if (!items.length) return null;
    return h(
      "div",
      { class: "ch-dots", "aria-label": `${items.filter((i) => i.done).length} of ${items.length} done` },
      ...items.map((i) => h("i", { class: i.done ? "ch-dot ch-dot-on" : "ch-dot", "aria-hidden": "true" })),
    );
  };

  const progressRing = (items: Item[]) => {
    const n = items.length;
    const done = items.filter((i) => i.done).length;
    const pct = n ? Math.round((done / n) * 100) : 0;
    return h("div", { class: "ch-ring", style: `--pct:${pct}` }, h("span", { class: "ch-ring-label" }, n ? `${done}/${n}` : "0"));
  };

  function draw() {
    if (!data) return;
    const cols = columns(data, w.personIds, ticks);
    if (!cols.length)
      return fill(root, h("div", { class: "w-empty" }, "Add the kids and their chores under Settings › Chores in the admin panel."));
    const active = activePeriod(hourInZone(new Date(), ctx.timeZone));
    const showBands = w.layout === "byPeriod";
    const showProgress = w.layout === "progress";

    fill(
      root,
      w.title ? h("div", { class: "w-label" }, w.title) : null,
      h(
        "div",
        { class: `ch-cols${showProgress ? " ch-cols-progress" : ""}`, style: `--n:${cols.length}` },
        ...cols.map(({ person: p, items }) => {
          const finished = items.length > 0 && items.every((i) => i.done);
          const body =
            showBands && items.length
              ? h(
                  "div",
                  { class: "ch-bands" },
                  ...bandsFor(items).map(({ period, items: band }) =>
                    h(
                      "section",
                      { class: `ch-band${period === active ? " ch-band-now" : ""}` },
                      h("div", { class: "ch-band-label" }, PERIOD_LABELS[period]),
                      h("ul", { class: "ch-list" }, ...band.map((item) => itemRow(p, item))),
                    ),
                  ),
                )
              : items.length
                ? h("ul", { class: "ch-list" }, ...items.map((item) => itemRow(p, item)))
                : h("div", { class: "ch-free" }, "No chores today");

          return h(
            "section",
            { class: `ch-col${finished ? " ch-finished" : ""}`, style: `--kid:${p.color}` },
            h(
              "div",
              { class: "ch-head" },
              h("span", { class: "ch-avatar", "aria-hidden": "true" }, p.emoji || p.name.slice(0, 1).toUpperCase()),
              h("span", { class: "ch-name" }, p.name),
              w.showStars
                ? h(
                    "span",
                    { class: "ch-stars" },
                    `⭐ ${p.available}${p.goal ? ` / ${p.goal}` : ""}${p.available < p.stars ? ` (${p.stars} earned)` : ""}`,
                  )
                : null,
            ),
            showProgress ? progressRing(items) : dots(items),
            w.showStars && p.goal
              ? h("div", { class: "ch-bar" }, h("i", { style: `transform:scaleX(${Math.min(1, p.stars / p.goal)})` }))
              : null,
            body,
            finished ? h("div", { class: "ch-all" }, "All done! 🎉") : null,
            w.allowCheck && data?.rewards.length
              ? h(
                  "div",
                  { class: "ch-rewards" },
                  ...data!.rewards.map((r) => {
                    const b = h(
                      "button",
                      { type: "button", class: "ch-redeem", disabled: p.available < r.starsCost ? "true" : undefined },
                      `${r.name} (${r.starsCost}⭐)`,
                    );
                    b.addEventListener("click", (ev) => {
                      ev.stopPropagation();
                      redeem(r.id, p.id);
                    });
                    return b;
                  }),
                )
              : null,
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
