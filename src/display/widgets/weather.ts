import type { WeatherData } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h, svg } from "../dom";
import { shortTime, weekday } from "../format";
import { label, weatherIcon } from "../icons";
import type { Mount } from "./types";

export const weather: Mount<"weather"> = (el, w, ctx) => {
  const root = h("div", { class: "w-weather" }, h("div", { class: "w-empty" }, "Loading the forecast…"));
  el.append(root);
  return subscribe<WeatherData>("weather", 15 * 60_000, (d) => {
    const parts: HTMLElement[] = [];
    if (w.showCurrent) {
      parts.push(
        h(
          "div",
          { class: "wx-now" },
          svg(weatherIcon(d.current.code, d.current.isDay), "icon wx-now-icon"),
          h(
            "div",
            { class: "wx-now-text" },
            h("div", { class: "wx-temp" }, `${d.current.temp}°`),
            h("div", { class: "wx-desc" }, label(d.current.code, d.current.isDay)),
            h("div", { class: "wx-meta" }, `Feels ${d.current.feels}° · ${d.current.wind} ${d.units.wind} · ${d.current.humidity}%`),
          ),
          d.days[0]
            ? h(
                "div",
                { class: "wx-hilo" },
                h("span", { class: "wx-hi" }, `↑ ${d.days[0].max}°`),
                h("span", { class: "wx-lo" }, `↓ ${d.days[0].min}°`),
                d.days[0].precip >= 20 ? h("span", { class: "wx-pop" }, `💧 ${d.days[0].precip}%`) : null,
              )
            : null,
        ),
      );
    }
    if (w.showHourly) {
      parts.push(
        h(
          "div",
          { class: "wx-hours" },
          ...d.hours
            .filter((_, i) => i % 2 === 0)
            .slice(0, 8)
            .map((hr) =>
              h(
                "div",
                { class: "wx-hour" },
                h("div", { class: "wx-t" }, shortTime(hr.time, ctx.hour12)),
                svg(weatherIcon(hr.code, hr.isDay)),
                h("div", {}, `${hr.temp}°`),
              ),
            ),
        ),
      );
    }
    if (w.days > 0) {
      parts.push(
        h(
          "div",
          { class: "wx-days" },
          ...d.days
            .slice(w.showCurrent ? 1 : 0, (w.showCurrent ? 1 : 0) + w.days)
            .map((day) =>
              h(
                "div",
                { class: "wx-day" },
                h("div", { class: "wx-dn" }, weekday(day.date)),
                svg(weatherIcon(day.code)),
                h("div", { class: "wx-dt" }, h("span", { class: "wx-hi" }, `${day.max}°`), h("span", { class: "wx-lo" }, `${day.min}°`)),
                day.precip >= 30 ? h("div", { class: "wx-pop" }, `${day.precip}%`) : null,
              ),
            ),
        ),
      );
    }
    fill(root, ...parts);
  });
};
