import type { RiversData, RiverStationData } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import { fmt } from "../format";
import type { Mount } from "./types";

// River levels: one row per gauge with its level, which way it's going and a day's line. The server sends metres and
// m³/s with the trend already worked out (src/lib/rivers.ts); this file only formats and draws.
const EVERY = 5 * 60_000;
const SVG = "http://www.w3.org/2000/svg";
/** A gauge whose newest reading is older than this says when it was taken. */
const OLD = 3 * 3_600_000;
const ARROW = { rising: "▲", falling: "▼", steady: "▶" } as const;
const WORD = { rising: "Rising", falling: "Falling", steady: "Steady" } as const;

function level(m: number, imperial: boolean): string {
  return imperial ? `${(m * 3.28084).toFixed(1)} ft` : `${m.toFixed(2)} m`;
}

export function change(m: number, imperial: boolean): string {
  const v = imperial ? m * 39.3701 : m * 100;
  const shown = Math.abs(v) < 10 ? Math.round(v * 10) / 10 : Math.round(v);
  return `${shown > 0 ? "+" : shown < 0 ? "−" : "±"}${Math.abs(shown)} ${imperial ? "in" : "cm"}`;
}

function flow(cms: number, imperial: boolean): string {
  const v = imperial ? cms * 35.3147 : cms;
  const n = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${n.toLocaleString("en-CA")} ${imperial ? "ft³/s" : "m³/s"}`;
}

/** Points for the day's line in a 100 × 24 box; a near-flat day is drawn flat rather than magnifying a centimetre. */
export function riverLine(values: (number | null)[]): string[] {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return [];
  let lo = Math.min(...nums);
  let hi = Math.max(...nums);
  if (hi - lo < 0.1) {
    const mid = (hi + lo) / 2;
    lo = mid - 0.05;
    hi = mid + 0.05;
  }
  const step = 100 / (values.length - 1);
  const lines: string[] = [];
  let cur: string[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (cur.length > 1) lines.push(cur.join(" "));
      cur = [];
      return;
    }
    cur.push(`${Math.round(i * step * 10) / 10},${Math.round((22 - ((v - lo) / (hi - lo)) * 20) * 10) / 10}`);
  });
  if (cur.length > 1) lines.push(cur.join(" "));
  return lines;
}

function line(values: (number | null)[]): SVGSVGElement | null {
  const paths = riverLine(values);
  if (!paths.length) return null;
  const el = document.createElementNS(SVG, "svg");
  el.setAttribute("viewBox", "0 0 100 24");
  el.setAttribute("preserveAspectRatio", "none");
  el.setAttribute("class", "rv-line");
  el.setAttribute("aria-hidden", "true");
  for (const points of paths) {
    const p = document.createElementNS(SVG, "polyline");
    p.setAttribute("points", points);
    p.setAttribute("vector-effect", "non-scaling-stroke");
    el.append(p);
  }
  return el;
}

export const rivers: Mount<"rivers"> = (el, w, ctx) => {
  const root = h("div", { class: "w-rivers" }, h("div", { class: "w-empty" }, "Loading river levels…"));
  el.append(root);
  const at = fmt(ctx.timeZone, { hour: "numeric", minute: "2-digit", hour12: ctx.hour12 });
  const day = fmt(ctx.timeZone, { month: "short", day: "numeric" });

  const row = (s: RiverStationData, label: string, imperial: boolean) => {
    const name = h("div", { class: "rv-name" }, label || s.name);
    if (s.level === null && s.discharge === null)
      return h("div", { class: "rv-row rv-none" }, name, h("div", { class: "rv-sub" }, s.error ?? "No readings"));
    const old = s.at !== null && Date.now() - s.at > OLD;
    const trend = s.trend
      ? h(
          "span",
          { class: `rv-trend rv-${s.trend}` },
          `${ARROW[s.trend]} ${WORD[s.trend]}`,
          s.change6h !== null && s.trend !== "steady" ? ` ${change(s.change6h, imperial)} in 6 h` : "",
        )
      : null;
    const sub = [
      s.change24h !== null ? `${change(s.change24h, imperial)} in 24 h` : "",
      w.showDischarge && s.discharge !== null ? flow(s.discharge, imperial) : "",
      old && s.at !== null ? `at ${day.format(s.at)}, ${at.format(s.at)}` : "",
    ].filter(Boolean);
    return h(
      "div",
      { class: `rv-row${s.trend ? ` rv-${s.trend}` : ""}` },
      name,
      h(
        "div",
        { class: "rv-main" },
        h(
          "span",
          { class: "rv-level" },
          s.level !== null ? level(s.level, imperial) : s.discharge !== null ? flow(s.discharge, imperial) : "",
        ),
        trend,
      ),
      sub.length ? h("div", { class: "rv-sub" }, sub.join(" · ")) : null,
      w.showChart ? line(s.spark) : null,
    );
  };

  return subscribe<RiversData>("rivers", EVERY, (d) => {
    const label = w.title ? h("div", { class: "w-label" }, w.title) : null;
    if (!w.stations.length) return fill(root, label, h("div", { class: "w-empty" }, "Pick river gauges in this widget's settings"));
    const imperial = d.units === "imperial";
    const rows = w.stations.map((pick) => {
      const s = d.stations.find((x) => x.id === pick.id);
      return s
        ? row(s, pick.label, imperial)
        : h("div", { class: "rv-row rv-none" }, h("div", { class: "rv-name" }, pick.label || pick.id));
    });
    fill(root, label, h("div", { class: "rv-list" }, ...rows), h("div", { class: "rv-credit" }, "Water levels: Environment Canada"));
  });
};
