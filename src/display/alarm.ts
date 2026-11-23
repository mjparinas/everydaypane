import { h } from "./dom";
import { attachModal } from "./modal";

// Alarms for the kitchen timers and the pomodoro (Melvin, 2026-11-21: "visual and sound alerts"). The alarms belong
// to the screen, not to a widget: they are kept in localStorage and rung from here, so a timer still goes off when
// the time-of-day schedule has switched to a view without it, or a settings save has redrawn the widgets.
//
// Sound is made with Web Audio (a few beeps from an oscillator), so there is no sound file to load. Browsers let a page
// play sound only after a tap; starting a timer is a tap, which is when the audio is switched on.

export interface Alarm {
  key: string;
  title: string;
  at: number;
  sound: boolean;
  fullScreen: boolean;
  /** How long it rings if nobody taps it. */
  ringSeconds: number;
  /** "alarm" keeps beeping; "chime" is the pomodoro's softer two notes. */
  tone: "alarm" | "chime";
}

/** `dismissed` is true when someone tapped it, false when it rang out by itself. */
type Listener = (key: string, ringing: boolean, dismissed: boolean) => void;

const STORE = "everydaypane.alarms";
let alarms = new Map<string, Alarm>();
const ringing = new Map<string, { alarm: Alarm; timer: number }>();
const listeners = new Set<Listener>();
let nextTimer: number | undefined;
let soundTimer: number | undefined;
let overlay: HTMLElement | null = null;
let overlayDetach: (() => void) | null = null;
let audio: AudioContext | undefined;
let loaded = false;

function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify([...alarms.values()]));
  } catch {
    // Private mode or full storage: alarms still ring while the page stays open.
  }
}

/** Loads the saved alarms and rings any that came due while the page was closed. main.ts calls it at start. */
export function startAlarms(): void {
  if (loaded) return;
  loaded = true;
  try {
    const list = JSON.parse(localStorage.getItem(STORE) ?? "[]") as Alarm[];
    alarms = new Map(list.filter((a) => typeof a.key === "string" && typeof a.at === "number").map((a) => [a.key, a]));
  } catch {
    alarms = new Map();
  }
  // Switches the sound on with the first tap anywhere on the screen.
  document.addEventListener("pointerdown", unlockAudio, { passive: true });
  check();
}

/** Starts Web Audio. Call from a tap. */
export function unlockAudio(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    // No Web Audio: the alarm is visual only.
  }
}

function beep(at: number, freq: number, length: number, volume = 0.4) {
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(audio.destination);
  osc.start(at);
  osc.stop(at + length + 0.05);
}

/** One bar of sound: three quick beeps for an alarm, two rising notes for a chime. */
function playBar() {
  const list = [...ringing.values()].filter((r) => r.alarm.sound);
  if (!list.length || !audio) return;
  const t = audio.currentTime + 0.02;
  if (list.some((r) => r.alarm.tone === "alarm")) {
    for (let i = 0; i < 3; i++) beep(t + i * 0.17, 1046, 0.12);
  } else {
    beep(t, 660, 0.5, 0.3);
    beep(t + 0.35, 880, 0.7, 0.3);
  }
}

function soundLoop() {
  window.clearInterval(soundTimer);
  soundTimer = undefined;
  if (![...ringing.values()].some((r) => r.alarm.sound)) return;
  unlockAudio();
  playBar();
  soundTimer = window.setInterval(playBar, 1600);
}

function dismissOverlay() {
  for (const key of [...ringing.keys()]) dismissAlarm(key);
}

function drawOverlay() {
  const shown = [...ringing.values()].filter((r) => r.alarm.fullScreen).map((r) => r.alarm.title);
  if (!shown.length) {
    overlayDetach?.();
    overlayDetach = null;
    overlay?.remove();
    overlay = null;
    return;
  }
  const label = shown.length === 1 ? `${shown[0]}. Tap to stop.` : `${shown.join(", ")}. Tap to stop.`;
  const el = h(
    "div",
    { class: "ring", role: "alertdialog", "aria-label": label, "aria-live": "assertive" },
    h("div", { class: "ring-flash", "aria-hidden": "true" }),
    h("div", { class: "ring-icon", "aria-hidden": "true" }, "⏰"),
    ...shown.map((t) => h("div", { class: "ring-title" }, t)),
    h("div", { class: "ring-hint" }, "Tap to stop"),
  );
  el.addEventListener("click", dismissOverlay);
  overlayDetach?.();
  if (overlay) overlay.replaceWith(el);
  else (document.getElementById("app") ?? document.body).append(el);
  overlay = el;
  overlayDetach = attachModal(el, dismissOverlay);
}

function startRinging(a: Alarm, now: number) {
  const left = a.at + a.ringSeconds * 1000 - now;
  alarms.delete(a.key);
  save();
  if (left <= 0) return;
  window.clearTimeout(ringing.get(a.key)?.timer);
  ringing.set(a.key, { alarm: a, timer: window.setTimeout(() => stop(a.key, false), left) });
  drawOverlay();
  soundLoop();
  for (const l of listeners) l(a.key, true, false);
}

function stop(key: string, dismissed: boolean) {
  const r = ringing.get(key);
  if (!r) return;
  window.clearTimeout(r.timer);
  ringing.delete(key);
  drawOverlay();
  soundLoop();
  for (const l of listeners) l(key, false, dismissed);
}

/** Rings what is due and waits for the next alarm. */
function check() {
  window.clearTimeout(nextTimer);
  const now = Date.now();
  for (const a of [...alarms.values()]) if (a.at <= now) startRinging(a, now);
  const next = Math.min(...[...alarms.values()].map((a) => a.at));
  // Re-checks at least every minute, so a sleeping tablet that misses a timeout still catches up.
  if (Number.isFinite(next)) nextTimer = window.setTimeout(check, Math.min(Math.max(0, next - now) + 20, 60_000));
}

/** Sets (or moves) an alarm. One already ringing under the same key rings on (the pomodoro sets its next phase then). */
export function setAlarm(a: Alarm): void {
  startAlarms();
  alarms.set(a.key, a);
  save();
  check();
}

/** Takes an alarm off before it rings, or stops it ringing. */
export function clearAlarm(key: string): void {
  startAlarms();
  if (alarms.delete(key)) save();
  stop(key, false);
  check();
}

/** Takes off an alarm that hasn't rung yet, and leaves one that is ringing alone. */
export function unsetAlarm(key: string): void {
  startAlarms();
  if (alarms.delete(key)) save();
  check();
}

/** Stops a ringing alarm because someone tapped. */
export function dismissAlarm(key: string): void {
  stop(key, true);
}

export function isRinging(key: string): boolean {
  return ringing.has(key);
}

export function onAlarm(l: Listener): () => void {
  startAlarms();
  listeners.add(l);
  return () => listeners.delete(l);
}

/** For tests: forget everything. */
export function resetAlarms(): void {
  for (const r of ringing.values()) window.clearTimeout(r.timer);
  ringing.clear();
  alarms.clear();
  listeners.clear();
  window.clearTimeout(nextTimer);
  window.clearInterval(soundTimer);
  overlayDetach?.();
  overlayDetach = null;
  overlay?.remove();
  overlay = null;
  loaded = false;
  document.removeEventListener("pointerdown", unlockAudio);
}
