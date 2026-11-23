import type { TideEvent, TidesData } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import { shortTime } from "../format";
import type { Mount } from "./types";

const EVERY = 15 * 60_000;

function formatHeight(h: number | undefined, units: "m" | "ft", show: boolean): string {
  if (!show || h === undefined) return "";
  const v = units === "ft" ? h * 3.28084 : h;
  return `${v.toFixed(1)} ${units}`;
}

function row(ev: TideEvent, units: "m" | "ft", showHeight: boolean, hour12: boolean) {
  const when = shortTime(ev.time, hour12);
  const kind = ev.type === "high" ? "High" : "Low";
  const height = formatHeight(ev.height, units, showHeight);
  return h(
    "li",
    { class: `td-row td-${ev.type}` },
    h("span", { class: "td-when" }, when),
    h("span", { class: "td-kind" }, kind),
    height ? h("span", { class: "td-h" }, height) : null,
  );
}

export const tides: Mount<"tides"> = (el, w, ctx) => {
  const root = h("div", { class: "w-tides" }, h("div", { class: "w-empty" }, "Loading tides…"));
  el.append(root);
  let data: TidesData | null = null;

  const draw = () => {
    if (!data) return;
    const events = (data.byStation?.[w.stationId] ?? data.events).slice(0, w.count);
    if (!events.length) return fill(root, h("div", { class: "w-empty" }, "No tide times yet."));
    fill(
      root,
      h("div", { class: "w-label" }, w.title || w.stationName || "Tides"),
      h("ul", { class: "td-list" }, ...events.map((ev) => row(ev, data!.units, w.showHeight, ctx.hour12))),
    );
  };

  return subscribe<TidesData & { byStation?: Record<string, TideEvent[]> }>("tides", EVERY, (d) => {
    data = d;
    draw();
  });
};
