import { meetsBanner } from "@/lib/alerts";
import type { AlertData, DisplayPayload, EmergencyAlert } from "@/lib/display/types";

import { subscribe } from "./api";
import { fill, h } from "./dom";

// The emergency strip (Melvin, 2026-11-17): a red strip across the top of the screen, not a full-screen takeover, for
// alerts at or above config.alerts.banner. A dismissed alert stays hidden on this screen (remembered in localStorage)
// until it changes, and a new alert brings the strip back.
//
// Design review, 2026-11-26: a tap used to dismiss every alert at once, so a kid leaning on the panel could clear an
// evacuation order. Now a tap opens the strip to show every alert with its details, and Dismiss is a separate button
// inside it. Severe and extreme alerts come back after SERIOUS_SNOOZE_MS instead of staying hidden for good.

const KEY = "ep-dismissed-alerts";
/** How long a dismissed severe or extreme alert stays off the strip before it comes back. */
export const SERIOUS_SNOOZE_MS = 4 * 60 * 60_000;
/** An opened strip folds back up on its own, so the wall isn't left with half the screen covered. */
const OPEN_MS = 60_000;

/** Entries are "id@sent" (hidden until the alert changes) or "id@sent\tuntil" (hidden until that time, epoch ms). */
function dismissed(now = Date.now()): Map<string, number> {
  const out = new Map<string, number>();
  try {
    for (const entry of JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]) {
      const [k, until] = entry.split("\t");
      if (!k) continue;
      const t = until ? Number(until) : Infinity;
      if (t > now) out.set(k, t);
    }
  } catch {
    // Nothing remembered: show everything.
  }
  return out;
}
function remember(entries: Map<string, number>) {
  try {
    // Only the alerts still current are kept, so the list never grows.
    const list = [...entries].map(([k, t]) => (Number.isFinite(t) ? `${k}\t${t}` : k));
    localStorage.setItem(KEY, JSON.stringify(list.slice(-50)));
  } catch {
    // Private mode or storage full: the strip just comes back after a reload.
  }
}

const key = (a: EmergencyAlert) => `${a.id}@${a.sent}`;
const serious = (a: EmergencyAlert) => !a.notice && (a.severity === "extreme" || a.severity === "severe");

/** `onNew` hears about each alert the first time the strip shows it (the screen saver wakes for it). */
export function alertStrip(getPayload: () => DisplayPayload | null, onNew?: () => void): { el: HTMLElement; stop: () => void } {
  const el = h("div", { class: "alert-strip", role: "alert", "aria-live": "assertive" });
  let current: EmergencyAlert[] = [];
  let open = false;
  let closeTimer = 0;
  const seen = new Set<string>();

  const setOpen = (on: boolean) => {
    open = on;
    window.clearTimeout(closeTimer);
    if (on) closeTimer = window.setTimeout(() => setOpen(false), OPEN_MS);
    draw();
  };

  const draw = () => {
    const banner = getPayload()?.alerts.banner ?? "never";
    const hidden = dismissed();
    // Household notices (a washer done) show whatever the threshold, since the strip being on is the switch for them.
    const show = current.filter((a) => (a.notice || meetsBanner(a.severity, banner)) && !hidden.has(key(a)));
    el.classList.toggle("show", show.length > 0);
    const fresh = show.filter((a) => !seen.has(key(a)));
    for (const a of fresh) seen.add(key(a));
    if (fresh.length) onNew?.();
    // Emergencies first, so a notice never leads a red strip.
    show.sort((a, b) => Number(!!a.notice) - Number(!!b.notice));
    const [top] = show;
    if (!top) {
      open = false;
      el.classList.remove("open");
      return fill(el);
    }
    // Only notices on the strip: blue, not the emergency red.
    el.classList.toggle(
      "notice",
      show.every((a) => a.notice),
    );
    el.classList.toggle("open", open);
    if (!open) {
      return fill(
        el,
        h("span", { class: "as-icon", "aria-hidden": "true" }, top.notice ? (top.source === "smart" ? "ℹ" : "✓") : "⚠"),
        h(
          "span",
          { class: "as-text" },
          h("b", {}, top.title),
          top.area ? ` · ${top.area}` : "",
          show.length > 1 ? h("span", { class: "as-more" }, ` +${show.length - 1} more`) : null,
        ),
        h("span", { class: "as-close" }, show.length > 1 ? "Tap to see all" : "Tap for details"),
      );
    }
    const dismiss = h("button", { type: "button", class: "as-btn as-dismiss" }, "Dismiss");
    dismiss.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const now = Date.now();
      // Keep only what's still current, plus what this tap hides.
      const keep = new Map([...hidden].filter(([k]) => current.some((a) => key(a) === k)));
      for (const a of show) keep.set(key(a), serious(a) ? now + SERIOUS_SNOOZE_MS : Infinity);
      remember(keep);
      setOpen(false);
    });
    const close = h("button", { type: "button", class: "as-btn" }, "Close");
    close.addEventListener("click", (ev) => {
      ev.stopPropagation();
      setOpen(false);
    });
    fill(
      el,
      h(
        "ul",
        { class: "as-list" },
        ...show.map((a) =>
          h(
            "li",
            { class: `as-item${a.notice ? " as-notice" : ""}` },
            h("span", { class: "as-icon", "aria-hidden": "true" }, a.notice ? (a.source === "smart" ? "ℹ" : "✓") : "⚠"),
            h(
              "div",
              { class: "as-body" },
              h("div", {}, h("b", {}, a.title), a.area ? ` · ${a.area}` : ""),
              a.description ? h("div", { class: "as-desc" }, a.description) : null,
            ),
          ),
        ),
      ),
      h(
        "div",
        { class: "as-actions" },
        show.some(serious) ? h("span", { class: "as-hint" }, "Serious alerts come back in 4 hours") : null,
        close,
        dismiss,
      ),
    );
  };
  el.onclick = () => {
    if (!open) setOpen(true);
  };

  const stop = subscribe<AlertData>("alerts", 60_000, (d) => {
    current = d.alerts;
    draw();
  });
  return {
    el,
    stop: () => {
      stop();
      window.clearTimeout(closeTimer);
    },
  };
}

export function alertsList(root: HTMLElement, all: EmergencyAlert[], opts: { showAllClear: boolean; place: string; title?: string }) {
  // The widget lists emergencies; household notices live on the strip and their own widgets.
  const alerts = all.filter((a) => !a.notice);
  if (!alerts.length) {
    fill(
      root,
      opts.title ? h("div", { class: "w-label" }, opts.title) : null,
      opts.showAllClear
        ? h(
            "div",
            { class: "w-empty al-clear" },
            // One child, so the grid keeps the tick and its words together (they sat ~500 px apart in a tall tile).
            h(
              "div",
              {},
              h("span", { class: "al-ok", "aria-hidden": "true" }, "✓"),
              h("div", {}, `No alerts for ${opts.place || "your area"}`),
            ),
          )
        : null,
    );
    return;
  }
  fill(
    root,
    h("div", { class: "w-label" }, opts.title || "Alerts"),
    h(
      "ul",
      { class: "al-list" },
      ...alerts.map((a) =>
        h(
          "li",
          { class: `al-item al-${a.severity}` },
          h("div", { class: "al-title" }, a.title),
          a.area ? h("div", { class: "al-area" }, a.area) : null,
          a.description ? h("div", { class: "al-desc" }, a.description) : null,
        ),
      ),
    ),
  );
}
