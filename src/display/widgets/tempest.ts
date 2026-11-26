import type { TempestData } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import type { Mount } from "./types";

const EVERY = 60_000;

export const tempest: Mount<"tempest"> = (el, w) => {
  const root = h("div", { class: "w-tempest" }, h("div", { class: "w-empty" }, "Loading station…"));
  el.append(root);
  return subscribe<TempestData>("tempest", EVERY, (d) => {
    const parts = [
      d.temp !== undefined ? h("div", { class: "tp-main" }, `${d.temp}${d.units.temp}`) : null,
      w.showHumidity && d.humidity !== undefined ? h("div", { class: "tp-row" }, `Humidity ${d.humidity}%`) : null,
      w.showWind && d.wind !== undefined
        ? h("div", { class: "tp-row" }, `Wind ${d.wind} ${d.units.wind}${d.gust ? ` (gust ${d.gust})` : ""}`)
        : null,
      w.showRain && d.rain !== undefined ? h("div", { class: "tp-row" }, `Rain today ${d.rain} ${d.units.rain}`) : null,
      d.stale ? h("div", { class: "tp-stale" }, "Last Good Reading") : null,
    ];
    fill(root, h("div", { class: "w-label" }, w.title || "Tempest"), ...parts.filter(Boolean));
  });
};
