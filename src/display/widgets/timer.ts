import { addTime, clockText, durationText, isDone, pauseTimer, resumeTimer, timeLeft, type KitchenTimer } from "@/lib/timers";

import { clearAlarm, isRinging, onAlarm, setAlarm, unlockAudio } from "../alarm";
import { fill, h, setText } from "../dom";
import { everySecond } from "../ticker";
import type { Mount } from "./types";

// Kitchen timers (Melvin, 2026-11-21: "1 with visual and sound alerts"): a tap on a preset starts a timer, several
// can run at once, and when one is done the widget flashes, the screen shows it full screen and the display beeps
// until someone taps. The timers are kept in localStorage, so a settings save or a reload doesn't lose the pasta.

export const MAX_TIMERS = 6;
// A finished timer nobody tapped stays on as "Done" for this long.
const DONE_KEEP_MS = 10 * 60_000;

const storeKey = (widgetId: string) => `everydaypane.timer.${widgetId}`;
export const alarmKey = (widgetId: string, timerId: string) => `timer:${widgetId}:${timerId}`;

function loadTimers(widgetId: string): KitchenTimer[] {
  try {
    const list = JSON.parse(localStorage.getItem(storeKey(widgetId)) ?? "[]") as KitchenTimer[];
    return Array.isArray(list) ? list.filter((t) => typeof t.id === "string" && typeof t.totalMs === "number") : [];
  } catch {
    return [];
  }
}

function saveTimers(widgetId: string, list: KitchenTimer[]) {
  try {
    if (list.length) localStorage.setItem(storeKey(widgetId), JSON.stringify(list));
    else localStorage.removeItem(storeKey(widgetId));
  } catch {
    // Not kept across reloads, but still runs.
  }
}

export const timer: Mount<"timer"> = (el, w) => {
  const root = h("div", { class: "w-timer" });
  el.append(root);
  let list = loadTimers(w.id);
  let seq = 0;
  // The text node of each timer's time, so a second's tick only rewrites the digits.
  const clocks = new Map<string, { time: HTMLElement; bar: HTMLElement }>();
  let drawnDone = new Set<string>();
  let stopTick: (() => void) | null = null;

  const alarmFor = (t: KitchenTimer, at: number) => ({
    key: alarmKey(w.id, t.id),
    title: t.label ? `${t.label} is done` : `${durationText(Math.round(t.totalMs / 1000))} timer is done`,
    at,
    sound: w.sound,
    fullScreen: w.fullScreen,
    ringSeconds: w.ringSeconds,
    tone: "alarm" as const,
  });

  const change = (next: KitchenTimer[]) => {
    list = next;
    saveTimers(w.id, list);
    draw();
  };

  const start = (label: string, seconds: number) => {
    unlockAudio();
    const now = Date.now();
    const t: KitchenTimer = { id: `${now.toString(36)}${seq++}`, label, totalMs: seconds * 1000, endsAt: now + seconds * 1000, leftMs: 0 };
    setAlarm(alarmFor(t, t.endsAt!));
    change([...list, t].slice(-MAX_TIMERS));
  };

  const remove = (t: KitchenTimer) => {
    clearAlarm(alarmKey(w.id, t.id));
    change(list.filter((x) => x.id !== t.id));
  };

  const toggle = (t: KitchenTimer) => {
    unlockAudio();
    const now = Date.now();
    if (isDone(t, now)) return remove(t);
    const next = t.endsAt === null ? resumeTimer(t, now) : pauseTimer(t, now);
    if (next.endsAt === null) clearAlarm(alarmKey(w.id, t.id));
    else setAlarm(alarmFor(next, next.endsAt));
    change(list.map((x) => (x.id === t.id ? next : x)));
  };

  const more = (t: KitchenTimer) => {
    unlockAudio();
    const next = addTime(t, 60_000, Date.now());
    if (next.endsAt !== null) setAlarm(alarmFor(next, next.endsAt));
    change(list.map((x) => (x.id === t.id ? next : x)));
  };

  const button = (cls: string, label: string, text: string, onTap: () => void) => {
    const b = h("button", { type: "button", class: cls, "aria-label": label }, text);
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      onTap();
    });
    return b;
  };

  function row(t: KitchenTimer, now: number) {
    const done = isDone(t, now);
    const ring = done && isRinging(alarmKey(w.id, t.id));
    const time = h("span", { class: "tm-time" }, done ? "Done" : clockText(timeLeft(t, now)));
    const bar = h("span", { class: "tm-bar" });
    clocks.set(t.id, { time, bar });
    const main = h(
      "button",
      {
        type: "button",
        class: "tm-main",
        "aria-label": done ? "Stop the timer" : t.endsAt === null ? "Resume" : "Pause",
      },
      h("span", { class: "tm-label" }, t.label || durationText(Math.round(t.totalMs / 1000))),
      time,
      h("span", { class: "tm-track", "aria-hidden": "true" }, bar),
    );
    main.addEventListener("click", (ev) => {
      ev.stopPropagation();
      toggle(t);
    });
    const cls = `tm${done ? " tm-done" : ""}${ring ? " tm-ringing" : ""}${t.endsAt === null ? " tm-paused" : ""}`;
    return h(
      "li",
      { class: cls },
      main,
      done ? null : button("tm-btn", "Add a minute", "+1", () => more(t)),
      button("tm-btn", "Cancel", "✕", () => remove(t)),
    );
  }

  function tick(now: Date) {
    const ms = now.getTime();
    let finished = false;
    for (const t of list) {
      const c = clocks.get(t.id);
      if (!c) continue;
      const left = timeLeft(t, ms);
      if (isDone(t, ms) && !drawnDone.has(t.id)) finished = true;
      setText(c.time, isDone(t, ms) ? "Done" : clockText(left));
      c.bar.style.transform = `scaleX(${t.totalMs ? 1 - left / t.totalMs : 1})`;
    }
    if (finished) draw();
  }

  function draw() {
    const now = Date.now();
    // Finished timers that rang out a while ago, or were stopped elsewhere, go away.
    const kept = list.filter((t) => !isDone(t, now) || isRinging(alarmKey(w.id, t.id)) || now - t.endsAt! < DONE_KEEP_MS);
    if (kept.length !== list.length) {
      list = kept;
      saveTimers(w.id, list);
    }
    clocks.clear();
    drawnDone = new Set(list.filter((t) => isDone(t, now)).map((t) => t.id));
    const full = list.length >= MAX_TIMERS;
    fill(
      root,
      w.title ? h("div", { class: "w-label" }, w.title) : null,
      list.length ? h("ul", { class: "tm-list" }, ...list.map((t) => row(t, now))) : null,
      h(
        "div",
        { class: `tm-presets${list.length ? "" : " tm-only"}` },
        ...w.presets.map((p) => {
          // A named button reads "🥚 Eggs" over "7 min"; an unnamed one is just its length.
          const name = `${p.emoji} ${p.label}`.trim();
          const b = h(
            "button",
            { type: "button", class: "tm-preset", disabled: full },
            name ? h("span", { class: "tm-pname" }, name) : null,
            h("span", { class: name ? "tm-plen" : "" }, durationText(p.seconds)),
          );
          b.addEventListener("click", (ev) => {
            ev.stopPropagation();
            start(p.label, p.seconds);
          });
          return b;
        }),
      ),
      w.presets.length ? null : h("div", { class: "w-empty" }, "Add timer buttons in this widget's settings."),
    );
    const running = list.some((t) => t.endsAt !== null && !isDone(t, now));
    if (running && !stopTick) {
      // everySecond calls back at once, so mark the tick as started before it does.
      stopTick = () => undefined;
      stopTick = everySecond(tick);
    } else if (!running && stopTick) {
      stopTick();
      stopTick = null;
    }
  }

  // A timer that has rung out (or was stopped from the full-screen alarm) is redrawn; a tap there also removes it.
  const stopAlarms = onAlarm((key, _on, dismissed) => {
    const t = list.find((x) => alarmKey(w.id, x.id) === key);
    if (!t) return;
    if (dismissed) change(list.filter((x) => x !== t));
    else draw();
  });

  // Timers that ended while this widget wasn't on screen and are no longer ringing are let go.
  const now = Date.now();
  list = list.filter((t) => !isDone(t, now) || isRinging(alarmKey(w.id, t.id)));
  saveTimers(w.id, list);
  draw();

  return () => {
    stopTick?.();
    stopAlarms();
  };
};
