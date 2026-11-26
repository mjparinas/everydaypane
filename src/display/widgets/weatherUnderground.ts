import type { WeatherUndergroundData } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import type { Mount } from "./types";

const EVERY = 5 * 60_000;

export const weatherUnderground: Mount<"weatherUnderground"> = (el, w) => {
  const root = h("div", { class: "w-wu" }, h("div", { class: "w-empty" }, "Loading PWS…"));
  el.append(root);
  return subscribe<WeatherUndergroundData>("weather-underground", EVERY, (d) => {
    const parts = [
      d.temp !== undefined ? h("div", { class: "wu-main" }, `${d.temp}${d.units.temp}`) : null,
      w.showHumidity && d.humidity !== undefined ? h("div", { class: "wu-row" }, `Humidity ${d.humidity}%`) : null,
      w.showWind && d.wind !== undefined
        ? h("div", { class: "wu-row" }, `Wind ${d.wind} ${d.units.wind}${d.gust ? ` (gust ${d.gust})` : ""}`)
        : null,
      w.showRain && (d.rainRate !== undefined || d.rainToday !== undefined)
        ? h(
            "div",
            { class: "wu-row" },
            d.rainRate !== undefined ? `Now ${d.rainRate} ${d.units.rain}/h` : "",
            d.rainToday !== undefined ? ` · Today ${d.rainToday} ${d.units.rain}` : "",
          )
        : null,
      d.stale ? h("div", { class: "wu-stale" }, "Last Good Reading") : null,
    ];
    fill(root, h("div", { class: "w-label" }, w.title || "Weather Station"), ...parts.filter(Boolean));
  });
};
