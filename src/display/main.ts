import type { Palette, Period, Theme, View } from "@/lib/config/schema";
import { currentPeriod, msUntilNextPeriod } from "@/lib/config/time";
import type { DisplayPayload } from "@/lib/display/types";

import { alertStrip } from "./alerts";
import { get, offline, onOfflineChange, post, PREVIEW, TOKEN } from "./api";
import { h } from "./dom";
import { mountWidget } from "./widgets";
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
  // A fixed view still follows day and night from the schedule.
  const modePeriod = period ?? currentPeriod(p.schedule, now, p.location.timeZone);
  const mode = p.schedule[modePeriod].mode;
  return { view, period, theme, palette: mode === "night" ? theme.night : theme.day, dimLevel: p.schedule[modePeriod].dim };
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
    stage.style.cssText = `grid-template-columns:repeat(${view.cols},minmax(0,1fr));grid-template-rows:repeat(${view.rows},minmax(0,1fr));gap:${view.gap}px;padding:${view.padding}px`;
    const ctx = { payload: p, timeZone: p.location.timeZone, hour12: p.hour12 };
    for (const w of view.widgets) {
      const cell = h("section", {
        class: `cell cell-${w.type}`,
        style: `grid-column:${w.x + 1}/span ${w.w};grid-row:${w.y + 1}/span ${w.h}`,
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
  if (!r.data) return false;
  payload = r.data;
  etag = r.etag ?? undefined;
  render();
  burnIn();
  alerts();
  return true;
}

async function poll() {
  await loadState();
  window.setTimeout(() => void poll(), 30_000);
}

// ---- Emergency strip: polled every minute while alerts are on. ----

let strip: { el: HTMLElement; stop: () => void } | null = null;
function alerts() {
  const on = payload?.alerts.enabled === true && payload.alerts.banner !== "never";
  if (on && !strip) {
    strip = alertStrip(() => payload);
    app.prepend(strip.el);
  } else if (!on && strip) {
    strip.stop();
    strip.el.remove();
    strip = null;
  }
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
  const now = new Date();
  const next = new Date(now);
  next.setHours(3, 30, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  window.setTimeout(() => {
    if (!offline) location.reload();
    else nightlyReload();
  }, next.getTime() - now.getTime());
}

async function start() {
  app.className = "app";
  app.replaceChildren(stage, dim, offlineDot);
  onOfflineChange(() => offlineDot.classList.toggle("show", offline));
  if (TOKEN && !PREVIEW && "serviceWorker" in navigator) {
    void navigator.serviceWorker.register(`/display/sw.js?v=${document.body.dataset.v ?? ""}`, { scope: "/d/" }).catch(() => undefined);
  }
  while (!(await loadState())) {
    stage.replaceChildren(h("div", { class: "connecting" }, "Connecting…"));
    await new Promise((r) => setTimeout(r, 10_000));
  }
  window.setTimeout(() => void poll(), 30_000);
  void wakeLock();
  nightlyReload();
}

void start();
