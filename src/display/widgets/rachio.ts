import type { RachioController, RachioData } from "@/lib/display/types";

import { refresh, sendExplained, subscribe } from "../api";
import { fill, h } from "../dom";
import { fmt } from "../format";
import { when } from "./sports";
import type { Mount } from "./types";

// Rachio sprinklers: each controller's next watering, with a Skip button when the widget allows it. Skipping needs a
// second tap within four seconds, because a skip can't be undone from the wall.
const EVERY = 5 * 60_000;
const CONFIRM_MS = 4000;

export const rachio: Mount<"rachio"> = (el, w, ctx) => {
  const root = h("div", { class: "w-rachio" }, h("div", { class: "w-empty" }, "Loading sprinklers…"));
  el.append(root);
  const day = fmt(ctx.timeZone, { weekday: "short", hour: "numeric", minute: "2-digit", hour12: ctx.hour12 });
  let data: RachioData | null = null;
  /** The controller whose Skip is waiting for its second tap, and what a skip said. */
  let arming: { id: string; timer: number } | null = null;
  const notes = new Map<string, string>();
  let busy = "";

  const disarm = () => {
    if (arming) window.clearTimeout(arming.timer);
    arming = null;
  };

  async function skip(c: RachioController) {
    if (!c.next || busy) return;
    if (arming?.id !== c.id) {
      disarm();
      arming = { id: c.id, timer: window.setTimeout(() => (disarm(), draw()), CONFIRM_MS) };
      return draw();
    }
    disarm();
    busy = c.id;
    draw();
    const why = await sendExplained("rachio", { controller: c.id, start: c.next.start });
    busy = "";
    notes.set(c.id, why === null ? "Skipped" : why || "Couldn't skip");
    window.setTimeout(() => (notes.delete(c.id), draw()), 8000);
    refresh("rachio");
    draw();
  }

  function block(c: RachioController, now: Date) {
    const n = c.next;
    const name = data && data.controllers.length > 1 ? h("div", { class: "rc-name" }, c.name) : null;
    const note = notes.get(c.id);
    const delay =
      c.rainDelayUntil && c.rainDelayUntil > now.getTime()
        ? h("div", { class: "rc-sub" }, `Rain delay until ${day.format(c.rainDelayUntil)}`)
        : null;
    const offline = c.online ? null : h("div", { class: "rc-sub rc-warn" }, "Controller offline");
    if (!n)
      return h(
        "div",
        { class: "rc-dev" },
        name,
        h("div", { class: "rc-when" }, c.noSchedule ? "No upcoming waterings listed" : "Nothing scheduled in the next two weeks"),
        delay,
        offline,
        note ? h("div", { class: "rc-sub" }, note) : null,
      );
    const running = n.start <= now.getTime();
    const armed = arming?.id === c.id;
    let button: HTMLButtonElement | null = null;
    if (w.allowSkip && !running) {
      button = h(
        "button",
        { type: "button", class: armed ? "rc-skip rc-armed" : "rc-skip", disabled: busy === c.id },
        busy === c.id ? "Skipping…" : armed ? "Tap again to skip" : "Skip",
      );
      button.addEventListener("click", (ev) => {
        ev.stopPropagation();
        void skip(c);
      });
    }
    return h(
      "div",
      { class: "rc-dev" },
      name,
      h(
        "div",
        { class: "rc-row" },
        h(
          "div",
          { class: "rc-main" },
          h("div", { class: "rc-when" }, running ? "Watering now" : when(n.start, now, ctx.timeZone, ctx.hour12)),
          h("div", { class: "rc-sub" }, `${n.name} · ${n.minutes} min`),
        ),
        button,
      ),
      w.showZones && n.zones.length ? h("div", { class: "rc-zones" }, n.zones.join(", ")) : null,
      delay,
      offline,
      note ? h("div", { class: "rc-sub" }, note) : null,
    );
  }

  function draw() {
    if (!data) return;
    const label = h("div", { class: "w-label" }, w.title || "Sprinklers");
    if (!data.configured) return fill(root, label, h("div", { class: "w-empty" }, "Connect Rachio in Settings › Sprinklers"));
    const picked = w.devices.length ? data.controllers.filter((c) => w.devices.includes(c.id)) : data.controllers;
    if (!picked.length) return fill(root, label, h("div", { class: "w-empty" }, data.error ?? "No Rachio controllers yet"));
    const now = new Date();
    fill(
      root,
      label,
      ...picked.map((c) => block(c, now)),
      data.stale ? h("div", { class: "rc-sub" }, "Rachio didn't answer; last good schedule") : null,
    );
  }

  const stop = subscribe<RachioData>("rachio", EVERY, (d) => {
    data = d;
    draw();
  });
  // "Today 5 AM" turns into "Watering now" between feeds.
  const tick = window.setInterval(draw, 60_000);
  return () => {
    stop();
    disarm();
    window.clearInterval(tick);
  };
};
