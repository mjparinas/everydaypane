import type { TideCurve, TideEvent, TidesData } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import { fmt } from "../format";
import type { Mount } from "./types";

// Loads on its own (src/display/widgets/lazy.ts). The day curve (Melvin, 2026-11-25) is one SVG path of the server's
// half-hourly predictions; only the "now" line moves, once a minute.

const EVERY = 15 * 60_000;
const SVG = "http://www.w3.org/2000/svg";
const W = 480;
const H = 100;

function formatHeight(h: number | undefined, units: "m" | "ft", show: boolean): string {
  if (!show || h === undefined) return "";
  const v = units === "ft" ? h * 3.28084 : h;
  return `${v.toFixed(1)} ${units}`;
}

function when(iso: string, timeZone: string, hour12: boolean): string {
  return fmt(timeZone, { hour: "numeric", minute: "2-digit", hour12 })
    .format(Date.parse(iso))
    .replace(/\s?([ap])\.?m\.?/i, (_, p: string) => ` ${p.toUpperCase()}M`);
}

function row(ev: TideEvent, units: "m" | "ft", showHeight: boolean, timeZone: string, hour12: boolean) {
  const height = formatHeight(ev.height, units, showHeight);
  return h(
    "li",
    { class: `td-row td-${ev.type}` },
    h("span", { class: "td-when" }, when(ev.time, timeZone, hour12)),
    h("span", { class: "td-kind" }, ev.type === "high" ? "High" : "Low"),
    height ? h("span", { class: "td-h" }, height) : null,
  );
}

function node<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** The curve's line and the area under it, scaled to the day's own range so small tides still show their shape. */
export function curvePaths(heights: number[]): { line: string; area: string } {
  const lo = Math.min(...heights);
  const hi = Math.max(...heights);
  const span = hi - lo || 1;
  const pts = heights.map((v, i) => `${((i / (heights.length - 1)) * W).toFixed(1)} ${(H - 6 - ((v - lo) / span) * (H - 12)).toFixed(1)}`);
  const line = `M${pts.join("L")}`;
  return { line, area: `${line}L${W} ${H}L0 ${H}Z` };
}

function curveSvg(c: TideCurve): { el: SVGSVGElement; place: () => void } {
  const el = node("svg", { class: "td-curve", viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", "aria-hidden": "true" });
  const { line, area } = curvePaths(c.heights);
  el.append(
    node("path", { class: "td-area", d: area }),
    node("path", { class: "td-line", d: line, "vector-effect": "non-scaling-stroke" }),
  );
  const now = node("line", { class: "td-now", y1: "0", y2: String(H), "vector-effect": "non-scaling-stroke" });
  el.append(now);
  const start = Date.parse(c.start);
  const span = (c.heights.length - 1) * c.stepMinutes * 60_000;
  const place = () => {
    const x = Math.max(0, Math.min(1, (Date.now() - start) / span)) * W;
    now.setAttribute("x1", x.toFixed(1));
    now.setAttribute("x2", x.toFixed(1));
  };
  place();
  return { el, place };
}

export const tides: Mount<"tides"> = (el, w, ctx) => {
  const root = h("div", { class: "w-tides" }, h("div", { class: "w-empty" }, "Loading tides…"));
  el.append(root);
  let data: TidesData | null = null;
  let place: (() => void) | undefined;

  const draw = () => {
    if (!data) return;
    const now = Date.now();
    const events = (data.byStation?.[w.stationId] ?? data.events).filter((e) => Date.parse(e.time) > now - 20 * 60_000).slice(0, w.count);
    const curve = w.showCurve ? data.curves?.[w.stationId] : undefined;
    place = undefined;
    if (!events.length && !curve) return fill(root, h("div", { class: "w-empty" }, "No tide times yet."));
    const svg = curve ? curveSvg(curve) : undefined;
    place = svg?.place;
    fill(
      root,
      h("div", { class: "w-label" }, w.title || w.stationName || "Tides"),
      svg ? h("div", { class: "td-chart" }, svg.el) : null,
      h("ul", { class: "td-list" }, ...events.map((ev) => row(ev, data!.units, w.showHeight, ctx.timeZone, ctx.hour12))),
    );
  };

  const tick = setInterval(() => place?.(), 60_000);
  const stop = subscribe<TidesData>("tides", EVERY, (d) => {
    data = d;
    draw();
  });
  return () => {
    clearInterval(tick);
    stop();
  };
};
