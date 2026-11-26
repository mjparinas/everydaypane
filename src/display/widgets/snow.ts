import type { SnowData, SnowMountain } from "@/lib/display/types";
import { DEFAULT_MOUNTAINS, snowAmount, weekday } from "@/lib/snow";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import type { Mount } from "./types";

// Mountain snow report (Melvin, 2026-11-25). Loads on its own (src/display/widgets/lazy.ts). The feed is read every
// 30 minutes on the server, so the wall asks every 15. One grid for the whole table (rows are `display: contents`),
// so the numbers line up in columns: name, last 24 hours, depth, then one column per forecast day.
const EVERY = 15 * 60_000;

export const snow: Mount<"snow"> = (el, w) => {
  const root = h("div", { class: "w-snow" }, h("div", { class: "w-empty" }, "Loading snow report…"));
  el.append(root);
  const ids = w.mountains.length ? w.mountains : DEFAULT_MOUNTAINS;
  return subscribe<SnowData>("snow", EVERY, (d) => {
    const rows = ids.map((id) => d.mountains.find((m) => m.id === id)).filter((m): m is SnowMountain => Boolean(m));
    if (!rows.length) return fill(root, h("div", { class: "w-empty" }, d.error ?? "No snow report yet."));
    const days = w.showForecast ? (rows.find((m) => m.forecast.length)?.forecast.map((f) => f.day) ?? []) : [];
    const amount = (cm: number | undefined) => (cm === undefined ? "–" : snowAmount(cm, d.unit));
    const cols = 2 + (w.showDepth ? 1 : 0) + days.length;
    fill(
      root,
      h("div", { class: "w-label" }, w.title || "Snow Report"),
      h(
        "div",
        { class: "sn-table", style: `grid-template-columns:minmax(0,1fr) repeat(${cols - 1},auto)` },
        h(
          "div",
          { class: "sn-row sn-head" },
          h("span"),
          h("span", {}, "24 h"),
          w.showDepth ? h("span", {}, "Depth") : null,
          ...days.map((day) => h("span", { class: "sn-day" }, weekday(day))),
        ),
        ...rows.map((m) =>
          h(
            "div",
            { class: `sn-row${(m.newSnow ?? 0) >= 1 ? " sn-fresh" : ""}` },
            h(
              "span",
              { class: "sn-name" },
              m.name,
              w.showTemperature && m.temperature !== undefined ? h("span", { class: "sn-temp" }, ` ${m.temperature}°`) : null,
            ),
            h("span", { class: "sn-new" }, amount(m.newSnow)),
            w.showDepth ? h("span", { class: "sn-depth" }, amount(m.depth)) : null,
            ...days.map((day) => {
              const snow = m.forecast.find((f) => f.day === day)?.snow;
              return h("span", { class: `sn-day${(snow ?? 0) >= 1 ? " sn-snowy" : ""}` }, amount(snow));
            }),
          ),
        ),
      ),
      h("div", { class: "sn-note" }, `${d.unit} · model estimate from Open-Meteo`),
    );
  });
};
