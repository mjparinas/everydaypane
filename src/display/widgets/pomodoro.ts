import {
  advance,
  clockText,
  endedText,
  freshPomodoro,
  nextPhase,
  PHASE_LABELS,
  phaseMs,
  settle,
  type PomodoroSettings,
  type PomodoroState,
} from "@/lib/timers";

import { clearAlarm, isRinging, onAlarm, setAlarm, unlockAudio, unsetAlarm } from "../alarm";
import { h, setText } from "../dom";
import { everySecond } from "../ticker";
import type { Mount } from "./types";

// The pomodoro (Melvin, 2026-11-21: "a separate pomodoro"): focus rounds and breaks of the lengths set in the
// widget's settings, a long break after the last round, and a chime (and a full-screen notice, if switched on) as
// each phase ends. Kept in localStorage like the kitchen timers, so a settings save or a reload keeps its place.

const storeKey = (widgetId: string) => `everydaypane.pomodoro.${widgetId}`;
export const pomodoroAlarmKey = (widgetId: string) => `pomodoro:${widgetId}`;

interface Saved {
  state: PomodoroState;
  /** The lengths it was started with; a paused pomodoro whose lengths changed starts over with the new ones. */
  lengths: string;
}

const lengthsOf = (s: PomodoroSettings) => `${s.workMinutes}/${s.shortBreakMinutes}/${s.longBreakMinutes}/${s.rounds}`;

function loadState(widgetId: string, s: PomodoroSettings): PomodoroState {
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey(widgetId)) ?? "null") as Saved | null;
    if (saved?.state && typeof saved.state.leftMs === "number") {
      if (saved.lengths === lengthsOf(s) || saved.state.endsAt !== null) return saved.state;
    }
  } catch {
    // Starts fresh.
  }
  return freshPomodoro(s);
}

export const pomodoro: Mount<"pomodoro"> = (el, w) => {
  const s: PomodoroSettings = w;
  const phaseEl = h("span", { class: "pm-phase" });
  const dots = h("span", { class: "pm-dots", "aria-hidden": "true" });
  const time = h("div", { class: "pm-time", role: "timer" });
  const bar = h("span", { class: "pm-bar" });
  const main = h("button", { type: "button", class: "pm-btn pm-go" });
  const skip = h("button", { type: "button", class: "pm-btn", "aria-label": "Skip to the next phase" }, "Skip");
  const reset = h("button", { type: "button", class: "pm-btn", "aria-label": "Start over" }, "Reset");
  const root = h(
    "div",
    { class: "w-pomodoro" },
    w.title ? h("div", { class: "w-label" }, w.title) : null,
    h("div", { class: "pm-head" }, phaseEl, dots),
    time,
    h("span", { class: "pm-track", "aria-hidden": "true" }, bar),
    h("div", { class: "pm-controls" }, main, skip, reset),
  );
  el.append(root);

  let state = loadState(w.id, s);
  let stopTick: (() => void) | null = null;
  let drawnPhase = "";

  const save = () => {
    try {
      localStorage.setItem(storeKey(w.id), JSON.stringify({ state, lengths: lengthsOf(s) } satisfies Saved));
    } catch {
      // Not kept across reloads.
    }
  };

  /** Sets the alarm for the end of the running phase, or takes it off when paused (a chime already ringing rings on). */
  const arm = () => {
    if (state.endsAt === null) return unsetAlarm(pomodoroAlarmKey(w.id));
    setAlarm({
      key: pomodoroAlarmKey(w.id),
      title: endedText(state.phase, nextPhase(state, s).phase),
      at: state.endsAt,
      sound: w.sound,
      fullScreen: w.fullScreen,
      ringSeconds: w.ringSeconds,
      tone: "chime",
    });
  };

  const set = (next: PomodoroState) => {
    state = next;
    save();
    arm();
    draw(Date.now());
  };

  const tap = (b: HTMLElement, fn: () => void) =>
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      unlockAudio();
      fn();
    });
  tap(main, () => {
    const now = Date.now();
    set(
      state.endsAt === null
        ? { ...state, endsAt: now + state.leftMs }
        : { ...state, endsAt: null, leftMs: Math.max(0, state.endsAt - now) },
    );
  });
  tap(skip, () => {
    clearAlarm(pomodoroAlarmKey(w.id));
    set(advance(state, s, state.endsAt !== null, Date.now()));
  });
  tap(reset, () => {
    clearAlarm(pomodoroAlarmKey(w.id));
    set(freshPomodoro(s));
  });

  function draw(now: number) {
    // A phase that ran out moves on (and starts the next one, with auto-start). The alarm module has already rung it.
    const settled = settle(state, s, now);
    if (settled.ended) {
      state = settled.state;
      save();
      arm();
    }
    const running = state.endsAt !== null;
    const left = running ? Math.max(0, state.endsAt! - now) : state.leftMs;
    setText(time, clockText(left));
    bar.style.transform = `scaleX(${1 - left / phaseMs(state.phase, s)})`;
    const sig = `${state.phase}|${state.round}|${running}`;
    if (sig !== drawnPhase) {
      drawnPhase = sig;
      root.dataset.phase = state.phase;
      root.classList.toggle("pm-paused", !running);
      setText(phaseEl, state.phase === "work" ? `${PHASE_LABELS.work} ${state.round} of ${s.rounds}` : PHASE_LABELS[state.phase]);
      dots.replaceChildren(
        ...Array.from({ length: s.rounds }, (_, i) => {
          const done = i + 1 < state.round || (i + 1 === state.round && state.phase !== "work");
          return h("span", { class: `pm-dot${done ? " on" : ""}${i + 1 === state.round && state.phase === "work" ? " now" : ""}` });
        }),
      );
      setText(main, running ? "Pause" : left < phaseMs(state.phase, s) ? "Resume" : "Start");
    }
    if (running && !stopTick) {
      // everySecond calls back at once, so mark the tick as started before it does.
      stopTick = () => undefined;
      stopTick = everySecond((d) => draw(d.getTime()));
    } else if (!running && stopTick) {
      stopTick();
      stopTick = null;
    }
  }

  // The widget flashes while the chime rings, whether or not the full-screen notice is on.
  const stopAlarms = onAlarm((key, on) => {
    if (key !== pomodoroAlarmKey(w.id)) return;
    root.classList.toggle("pm-ringing", on);
    if (on) draw(Date.now());
  });
  root.classList.toggle("pm-ringing", isRinging(pomodoroAlarmKey(w.id)));
  // Catch up first, so a phase the alarm module already rang (while another view showed) doesn't ring twice.
  draw(Date.now());
  arm();

  return () => {
    stopTick?.();
    stopAlarms();
  };
};
