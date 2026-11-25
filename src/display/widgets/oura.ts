import { dayLabel } from "@/lib/calendar";
import type { OuraData, OuraScore } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import { shortTime } from "../format";
import type { Mount } from "./types";

// Oura's own bands: 85 and up is optimal, 70 to 84 good, below 70 pay attention.
export const ouraBand = (score: number) => (score >= 85 ? "optimal" : score >= 70 ? "good" : "low");

export function sleepLength(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h ${String(minutes % 60).padStart(2, "0")} min` : `${minutes} min`;
}

function tile(label: string, s: OuraScore | undefined, extra?: string) {
  if (!s) return h("div", { class: "oura-tile" }, h("div", { class: "w-label" }, label), h("div", { class: "oura-score oura-none" }, "–"));
  return h(
    "div",
    { class: `oura-tile oura-${ouraBand(s.score)}` },
    h("div", { class: "w-label" }, label),
    h("div", { class: "oura-score" }, String(s.score)),
    h("div", { class: "oura-bar" }, h("span", { style: `transform:scaleX(${Math.min(100, Math.max(0, s.score)) / 100})` })),
    extra ? h("div", { class: "oura-extra" }, extra) : null,
  );
}

export const oura: Mount<"oura"> = (el, w, ctx) => {
  const root = h("div", { class: "w-oura" }, h("div", { class: "w-empty" }, "Loading…"));
  el.append(root);
  return subscribe<OuraData>("oura", 15 * 60_000, (d) => {
    if (!d.connected) return fill(root, h("div", { class: "w-empty" }, "Connect Oura under Settings › Content & finance."));
    if (d.error && !d.sleep && !d.readiness && !d.activity) return fill(root, h("div", { class: "w-empty" }, d.error));
    const tiles = [
      w.showSleep ? tile("Sleep", d.sleep) : null,
      w.showReadiness ? tile("Readiness", d.readiness) : null,
      w.showActivity
        ? tile("Activity", d.activity, d.activity?.steps !== undefined ? `${d.activity.steps.toLocaleString()} steps` : undefined)
        : null,
    ].filter(Boolean);
    const n = d.night;
    const details =
      w.showDetails && n
        ? h(
            "div",
            { class: "oura-night" },
            [
              `${sleepLength(n.asleepSeconds)} asleep`,
              n.bedtimeStart && n.bedtimeEnd ? `${shortTime(n.bedtimeStart, ctx.hour12)}–${shortTime(n.bedtimeEnd, ctx.hour12)}` : "",
              n.averageHrv !== undefined ? `HRV ${Math.round(n.averageHrv)} ms` : "",
              n.lowestHeartRate !== undefined ? `Lowest HR ${Math.round(n.lowestHeartRate)}` : "",
            ]
              .filter(Boolean)
              .join(" · "),
          )
        : null;
    // The ring syncs when someone opens the Oura app; until then the wall says which day the sleep numbers are from.
    const sleepDay = d.sleep?.day ?? d.readiness?.day;
    const note =
      sleepDay && sleepDay !== d.today
        ? h("div", { class: "oura-note" }, `From ${dayLabel(sleepDay, d.today)}. Open the Oura app to sync.`)
        : null;
    if (!tiles.length) return fill(root, h("div", { class: "w-empty" }, "Pick a score in this widget's settings."));
    fill(root, h("div", { class: "oura-tiles" }, ...tiles), details, note);
  });
};
