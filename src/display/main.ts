import { stackOrder } from "@/lib/config/grid";
import type { Palette, Period, Theme, View } from "@/lib/config/schema";
import { currentPeriod, msUntilLocalTime, msUntilNextPeriod } from "@/lib/config/time";
import { parseDraftMessage, previewReadyMessage } from "@/lib/display/draftMessage";
import type { DisplayPayload, HaData } from "@/lib/display/types";

import { onAlarm, startAlarms } from "./alarm";
import { alertStrip } from "./alerts";
import { get, offline, onOfflineChange, post, PREVIEW, previewMode, setPreviewMode, subscribe, TOKEN } from "./api";
import { h } from "./dom";
import { attachModal } from "./modal";
import { screenSaver, type Saver } from "./saver";
import { mountWidget } from "./widgets";
import { cameraLoop, HA_EVERY } from "./widgets/ha";
import type { Cleanup } from "./widgets/types";

// The display. One module, no framework (AGENTS.md "Display: super lightweight"): it fetches its settings, draws the
// view for the time of day, and then only wakes for the clock tick, data refreshes, the 30-second settings poll, the
// next period change and the burn-in shift.

const app = document.getElementById("app") as HTMLElement;
let payload: DisplayPayload | null = null;
let etag: string | undefined;
let cleanups: Cleanup[] = [];
let shown = { viewId: "", mode: "", themeId: "", version: -1 };
let periodTimer: number | undefined;
/** Admin Views tab is pushing an unsaved draft; the 30s saved poll must not overwrite it. */
let draftActive = false;
let draftSeq = 0;

const stage = h("main", { class: "stage" });
const dim = h("div", { class: "dim", "aria-hidden": "true" });
const offlineDot = h("div", { class: "offline", role: "status" }, "Offline · showing saved data");

// ---- Errors go to our own server, which passes them to Sentry. ----
let reported = 0;
function report(message: string, stack?: string) {
  if (reported++ > 5) return;
  post("error", { message: message.slice(0, 500), stack: stack?.slice(0, 4000), where: shown.viewId });
}
window.addEventListener("error", (e) => report(e.message, e.error instanceof Error ? e.error.stack : undefined));
window.addEventListener("unhandledrejection", (e) => report(String(e.reason), e.reason instanceof Error ? e.reason.stack : undefined));

// ---- No zooming (Melvin, 2026-11-17: "dont allow pinch zoom on the dashboard") ----
// The viewport meta and touch-action stop most browsers; these catch the rest: Safari's gesture events, two-finger
// touches, and trackpad pinches (which arrive as ctrl + wheel).
for (const type of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(type, (e) => e.preventDefault());
document.addEventListener("touchmove", (e) => e.touches.length > 1 && e.preventDefault(), { passive: false });
document.addEventListener("wheel", (e) => e.ctrlKey && e.preventDefault(), { passive: false });

// ---- What to show now ----

function pick(
  p: DisplayPayload,
  now = new Date(),
): { view: View; period: Period | null; theme: Theme; palette: Palette; dimLevel: number } {
  const period = p.fixedViewId ? null : currentPeriod(p.schedule, now, p.location.timeZone);
  const viewId = p.fixedViewId ?? (period ? p.schedule[period].viewId : "");
  const view = p.views.find((v) => v.id === viewId) ?? p.views[0];
  if (!view) throw new Error("No views to show");
  const theme = p.themes[view.themeId ?? p.themeId] ?? p.themes[p.themeId] ?? Object.values(p.themes)[0];
  if (!theme) throw new Error("No theme");
  // A fixed view still follows day and night from the schedule; an admin preview can force either.
  const modePeriod = period ?? currentPeriod(p.schedule, now, p.location.timeZone);
  const mode = previewMode || p.schedule[modePeriod].mode;
  // Preview night uses the night period's dim so the palette and dimming match what evening/night look like.
  const dimLevel = previewMode === "night" ? p.schedule.night.dim : previewMode === "day" ? 0 : p.schedule[modePeriod].dim;
  return { view, period, theme, palette: mode === "night" ? theme.night : theme.day, dimLevel };
}

function applyTheme(theme: Theme, palette: Palette, mode: string) {
  const r = document.documentElement.style;
  r.setProperty("--bg", palette.background);
  r.setProperty("--bg2", palette.backgroundTo);
  r.setProperty("--surface", palette.surface);
  r.setProperty("--text", palette.text);
  r.setProperty("--muted", palette.muted);
  r.setProperty("--accent", palette.accent);
  r.setProperty("--danger", palette.danger);
  r.setProperty("--radius", `${theme.radius}px`);
  r.setProperty("--surface-alpha", String(theme.surfaceOpacity));
  document.documentElement.dataset.mode = mode;
  document.documentElement.dataset.font = theme.font;
  document.documentElement.classList.toggle("glass", theme.glass);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", palette.background);
}

function render(force = false) {
  if (!payload) return;
  const p = payload;
  const now = new Date();
  const { view, theme, palette, dimLevel } = pick(p, now);
  const mode = palette === theme.night ? "night" : "day";
  applyTheme(theme, palette, mode);
  dim.style.opacity = String(dimLevel);
  if (force || shown.viewId !== view.id || shown.version !== p.version || shown.themeId !== theme.id) {
    for (const c of cleanups) c();
    cleanups = [];
    stage.replaceChildren();
    stage.style.cssText = `grid-template-columns:repeat(${view.cols},minmax(0,1fr));grid-template-rows:repeat(${view.rows},minmax(0,1fr));gap:${view.gap}px;padding:${view.padding}px;--cell-pad:${view.tilePadding}px`;
    const ctx = { payload: p, timeZone: p.location.timeZone, hour12: p.hour12 };
    // Photos are a backdrop (Melvin, 2026-11-21): they're drawn first and underneath, and a widget on top of one gets
    // `on-photo`, which keeps it readable against whatever picture is showing.
    for (const { widget: w, onPhoto } of stackOrder(view.widgets)) {
      // Each widget can drop its panel or override the theme's surface opacity (Melvin, 2026-11-22).
      const transparent = !w.showBackground;
      const alpha = !transparent && w.backgroundOpacity != null ? `--surface-alpha:${w.backgroundOpacity};` : "";
      const cell = h("section", {
        class: `cell cell-${w.type}${onPhoto ? " on-photo" : ""}${transparent ? " transparent" : ""}`,
        style: `grid-column:${w.x + 1}/span ${w.w};grid-row:${w.y + 1}/span ${w.h};${alpha}`,
        "aria-label": w.title ?? w.type,
      });
      stage.append(cell);
      try {
        cleanups.push(mountWidget(cell, w, ctx));
      } catch (e) {
        cell.textContent = "This widget couldn't load.";
        report(e instanceof Error ? e.message : String(e), e instanceof Error ? e.stack : undefined);
      }
    }
  }
  shown = { viewId: view.id, mode, themeId: theme.id, version: p.version };
  window.clearTimeout(periodTimer);
  periodTimer = window.setTimeout(() => render(), msUntilNextPeriod(p.schedule, new Date(), p.location.timeZone) + 500);
}

// ---- Settings: loaded at start, then polled every 30 seconds (Melvin, 2026-11-17: polling, not push). ----

async function loadState(): Promise<boolean> {
  const r = await get<DisplayPayload>("state", {}, etag);
  if (r.notModified) return true;
  // An embedded Views preview keeps showing the admin's draft until they clear it or leave.
  if (draftActive && payload) {
    if (r.data) etag = r.etag ?? etag;
    return true;
  }
  if (!r.data) return false;
  payload = r.data;
  etag = r.etag ?? undefined;
  render();
  burnIn();
  alerts();
  doorbell();
  saver?.update();
  return true;
}

async function poll() {
  await loadState();
  window.setTimeout(() => void poll(), 30_000);
}

/**
 * Admin Views tab → this preview (Melvin, 2026-11-22): apply the unsaved working copy so widget settings update
 * live. Only when framed by our own origin; earth's iframe and other windows are ignored.
 */
function listenForDraft() {
  if (!PREVIEW) return;
  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    const msg = parseDraftMessage(event.data);
    if (!msg) return;
    if (msg.type === "clear") {
      draftActive = false;
      void loadState();
      return;
    }
    draftActive = true;
    draftSeq += 1;
    // Bump version so render() remounts widgets when only options changed (same view/theme id).
    payload = { ...msg.payload, version: msg.payload.version + draftSeq, fixedViewId: PREVIEW };
    render(true);
    burnIn();
    alerts();
    doorbell();
    saver?.update();
  });
  // Tell the parent we're listening so it can push the current draft. Repeat a few times in case the
  // admin's listener wasn't attached when the first ping fired.
  const announce = () => {
    try {
      window.parent.postMessage(previewReadyMessage(), location.origin);
    } catch {
      // Not framed, or the parent is cross-origin: nothing to sync.
    }
  };
  announce();
  window.setTimeout(announce, 200);
  window.setTimeout(announce, 800);
}

// ---- Emergency strip: polled every minute while alerts are on. ----

let strip: { el: HTMLElement; stop: () => void } | null = null;
// Made in start(), before the first settings load.
let saver: Saver | null = null;
function alerts() {
  const on = payload?.alerts.enabled === true && payload.alerts.banner !== "never";
  if (on && !strip) {
    strip = alertStrip(
      () => payload,
      () => saver?.wake(),
    );
    app.prepend(strip.el);
  } else if (!on && strip) {
    strip.stop();
    strip.el.remove();
    strip = null;
  }
}

// ---- Doorbell: when the doorbell entity rings, the camera fills the screen for a while; a tap closes it. ----

let bell: { key: string; stop: () => void } | null = null;
let lastRing: string | null = null;
let closeRing: (() => void) | null = null;

function doorbell() {
  const d = payload?.doorbell;
  const key = d?.enabled ? `${d.entityId}|${d.cameraEntityId}|${d.seconds}` : "";
  if (bell?.key === key) return;
  bell?.stop();
  bell = null;
  lastRing = null;
  if (!d?.enabled) return;
  bell = {
    key,
    stop: subscribe<HaData>("ha", HA_EVERY, (data) => {
      const e = data.entities[d.entityId];
      if (!e || e.state === "unavailable" || e.state === "unknown") return;
      // A binary_sensor rings by turning on; an event entity's state is the time of its last press.
      const isEvent = d.entityId.startsWith("event.");
      const ring = isEvent ? e.state : e.state === "on" ? `on@${e.changed}` : "off";
      // The first look only learns the current state, so loading the page never rings.
      if (lastRing !== null && ring !== lastRing && (isEvent || e.state === "on")) ringDoor(d.cameraEntityId, d.seconds);
      lastRing = ring;
    }),
  };
}

function ringDoor(cameraEntityId: string, seconds: number) {
  closeRing?.();
  saver?.wake();
  const img = h("img", { class: "bell-img", alt: "Front door camera" });
  const el = h(
    "div",
    { class: "bell", role: "dialog", "aria-label": "Someone is at the door" },
    img,
    h("div", { class: "bell-title" }, "Someone's at the door"),
  );
  app.append(el);
  const stopCam = cameraLoop(img, cameraEntityId, 1000, () => undefined);
  const timer = window.setTimeout(() => closeRing?.(), seconds * 1000);
  const detach = attachModal(el, () => closeRing?.());
  closeRing = () => {
    detach();
    stopCam();
    window.clearTimeout(timer);
    el.remove();
    closeRing = null;
  };
  el.addEventListener("click", () => closeRing?.());
}

// ---- Burn-in protection: the whole layout drifts a few pixels every few minutes. ----

let burnTimer: number | undefined;
function burnIn() {
  window.clearTimeout(burnTimer);
  const b = payload?.burnIn;
  if (!b?.shift) {
    stage.style.translate = "";
    return;
  }
  const n = b.maxPixels;
  const dx = Math.round(Math.random() * 2 * n - n);
  const dy = Math.round(Math.random() * 2 * n - n);
  stage.style.translate = `${dx}px ${dy}px`;
  burnTimer = window.setTimeout(burnIn, b.minutes * 60_000);
}

// ---- Keep the screen awake, and refresh once a night to start clean. ----

async function wakeLock() {
  try {
    await (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<unknown> } }).wakeLock?.request("screen");
  } catch {
    // Not supported or not allowed: the display's own settings keep it on.
  }
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void wakeLock();
});

function nightlyReload() {
  // 3:30 in the home's zone. The display browser is often UTC, so setHours would reload in the middle of the evening.
  const timeZone = payload?.location.timeZone;
  if (!timeZone) return;
  window.setTimeout(
    () => {
      if (!offline) location.reload();
      else nightlyReload();
    },
    msUntilLocalTime(new Date(), timeZone, 3, 30),
  );
}

/** Admin preview only (Melvin, 2026-11-22): a quiet control to flip day ↔ night without leaving the page. */
function previewModeToggle(): HTMLButtonElement | null {
  if (!PREVIEW) return null;
  const btn = h(
    "button",
    { type: "button", class: "preview-mode", "aria-label": previewMode === "night" ? "Show day mode" : "Show night mode" },
    previewMode === "night" ? "Night" : "Day",
  ) as HTMLButtonElement;
  btn.addEventListener("click", () => {
    const next = (previewMode || "day") === "night" ? "day" : "night";
    setPreviewMode(next);
    btn.textContent = next === "night" ? "Night" : "Day";
    btn.setAttribute("aria-label", next === "night" ? "Show day mode" : "Show night mode");
    render();
  });
  return btn;
}

async function start() {
  app.className = "app";
  // Preview with no ?mode= still gets a starting mode from the schedule once settings load; default the button to day
  // until then so the control has a label.
  if (PREVIEW && !previewMode) setPreviewMode("day");
  const modeBtn = previewModeToggle();
  app.replaceChildren(stage, dim, offlineDot, ...(modeBtn ? [modeBtn] : []));
  saver = screenSaver(app, () => payload);
  onOfflineChange(() => offlineDot.classList.toggle("show", offline));
  // Timers and pomodoros set before a reload still ring, whichever view is showing.
  startAlarms();
  // A kitchen or pomodoro timer going off wakes the screen saver, so its full-screen alarm is seen.
  onAlarm((_key, ringing) => ringing && saver?.wake());
  if (TOKEN && !PREVIEW && "serviceWorker" in navigator) {
    void navigator.serviceWorker.register(`/display/sw.js?v=${document.body.dataset.v ?? ""}`, { scope: "/d/" }).catch(() => undefined);
  }
  listenForDraft();
  while (!(await loadState())) {
    stage.replaceChildren(h("div", { class: "connecting" }, "Connecting…"));
    await new Promise((r) => setTimeout(r, 10_000));
  }
  window.setTimeout(() => void poll(), 30_000);
  void wakeLock();
  nightlyReload();
}

void start();
