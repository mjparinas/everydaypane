import type { WeatherData } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h, svg } from "../dom";
import { shortTime, weekday } from "../format";
import { label, weatherIcon } from "../icons";
import type { Mount } from "./types";

/** Environment Canada's UV bands. */
function uvWord(n: number): string {
  if (n <= 2) return "low";
  if (n <= 5) return "moderate";
  if (n <= 7) return "high";
  if (n <= 10) return "very high";
  return "extreme";
}

/** A rough word for grains/m³. The number is what matters; the word is only a glance. */
function pollenWord(n: number): string {
  if (n <= 0) return "none";
  if (n < 20) return "low";
  if (n < 50) return "moderate";
  if (n < 100) return "high";
  return "very high";
}

/** The UV and pollen line, or "" when the widget has them off or the forecast didn't include them. */
export function weatherNotes(d: WeatherData, showUv: boolean, showPollen: boolean): string {
  const bits: string[] = [];
  if (showUv && d.current.uv !== undefined) {
    bits.push(`UV ${d.current.uv} · ${uvWord(d.current.uv)}`);
    if (d.today.uvMax !== undefined && d.today.uvMax > d.current.uv) bits.push(`peaks at ${d.today.uvMax}`);
  } else if (showUv && d.today.uvMax !== undefined) bits.push(`UV peaks at ${d.today.uvMax}`);
  if (showPollen && d.pollen !== undefined) bits.push(d.pollen <= 0 ? "No pollen" : `Pollen ${d.pollen} · ${pollenWord(d.pollen)}`);
  return bits.join(" · ");
}

export const weather: Mount<"weather"> = (el, w, ctx) => {
  const root = h("div", { class: "w-weather" }, h("div", { class: "w-empty" }, "Loading the forecast…"));
  root.style.setProperty("--wx-icon-scale", String(w.iconScale ?? 1));
  el.append(root);
  return subscribe<WeatherData>("weather", 15 * 60_000, (d) => {
    // Today's weather leads; the forecast rows shrink beside it, and shrink further when hourly and days share a tile.
    root.dataset.now = w.showCurrent ? "1" : "";
    root.dataset.dense = w.showCurrent && w.showHourly && w.days > 0 ? "1" : "";
    const parts: HTMLElement[] = [];
    if (w.title) parts.push(h("div", { class: "w-label" }, w.title));
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
    const notes = weatherNotes(d, w.showUv, w.showPollen);
    if (notes) parts.push(h("div", { class: "wx-extra" }, notes));
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
