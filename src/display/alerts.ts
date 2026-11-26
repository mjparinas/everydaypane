import { meetsBanner } from "@/lib/alerts";
import type { AlertData, DisplayPayload, EmergencyAlert } from "@/lib/display/types";

import { subscribe } from "./api";
import { fill, h } from "./dom";

// The emergency strip (Melvin, 2026-11-17): a red strip across the top of the screen, not a full-screen takeover, for
// alerts at or above config.alerts.banner. Anyone can tap it to dismiss; a dismissed alert stays hidden on this screen
// (remembered in localStorage) until it changes, and a new alert brings the strip back.

const KEY = "ep-dismissed-alerts";

function dismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function remember(ids: string[]) {
  try {
    // Only the alerts still current are kept, so the list never grows.
    localStorage.setItem(KEY, JSON.stringify(ids.slice(-50)));
  } catch {
    // Private mode or storage full: the strip just comes back after a reload.
  }
}

const key = (a: EmergencyAlert) => `${a.id}@${a.sent}`;

/** `onNew` hears about each alert the first time the strip shows it (the screen saver wakes for it). */
export function alertStrip(getPayload: () => DisplayPayload | null, onNew?: () => void): { el: HTMLElement; stop: () => void } {
  const el = h("div", { class: "alert-strip", role: "alert", "aria-live": "assertive" });
  let current: EmergencyAlert[] = [];
  const seen = new Set<string>();

  const draw = () => {
    const banner = getPayload()?.alerts.banner ?? "never";
    const hidden = dismissed();
    // Household notices (a washer done) show whatever the threshold, since the strip being on is the switch for them.
    const show = current.filter((a) => (a.notice || meetsBanner(a.severity, banner)) && !hidden.has(key(a)));
    el.classList.toggle("show", show.length > 0);
    const fresh = show.filter((a) => !seen.has(key(a)));
    for (const a of fresh) seen.add(key(a));
    if (fresh.length) onNew?.();
    const [top] = show;
    if (!top) return fill(el);
    // Only notices on the strip: blue, not the emergency red.
    el.classList.toggle(
      "notice",
      show.every((a) => a.notice),
    );
    fill(
      el,
      h("span", { class: "as-icon", "aria-hidden": "true" }, top.notice ? "✓" : "⚠"),
      h(
        "span",
        { class: "as-text" },
        h("b", {}, top.title),
        top.area ? ` · ${top.area}` : "",
        show.length > 1 ? h("span", { class: "as-more" }, ` +${show.length - 1} more`) : null,
      ),
      h("span", { class: "as-close" }, "Tap to dismiss ✕"),
    );
    el.onclick = () => {
      remember([...current.map(key).filter((k) => hidden.has(k)), ...show.map(key)]);
      draw();
    };
  };

  const stop = subscribe<AlertData>("alerts", 60_000, (d) => {
    current = d.alerts;
    draw();
  });
  return { el, stop };
}

export function alertsList(root: HTMLElement, all: EmergencyAlert[], opts: { showAllClear: boolean; place: string; title?: string }) {
  // The widget lists emergencies; household notices live on the strip and their own widgets.
  const alerts = all.filter((a) => !a.notice);
  if (!alerts.length) {
    fill(
      root,
      opts.title ? h("div", { class: "w-label" }, opts.title) : null,
      opts.showAllClear
        ? h("div", { class: "w-empty al-clear" }, h("span", { "aria-hidden": "true" }, "✓ "), `No alerts for ${opts.place || "your area"}`)
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
