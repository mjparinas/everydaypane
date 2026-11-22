import type { WeatherData } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import { shortTime } from "../format";
import type { Mount } from "./types";

/** The length of daylight between two local ISO times, or an empty string when either time is unavailable. */
export function daylightLength(sunrise: string, sunset: string): string {
  const minutes = (iso: string) => {
    const match = /T(\d{2}):(\d{2})/.exec(iso);
    return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
  };
  const total = minutes(sunset) - minutes(sunrise);
  if (!Number.isFinite(total) || total < 0) return "";
  return `${Math.floor(total / 60)} hr ${total % 60} min`;
}

export const sunTimes: Mount<"sunTimes"> = (el, _w, ctx) => {
  const root = h("div", { class: "w-sun-times" }, h("div", { class: "w-empty" }, "Loading sun times…"));
  el.append(root);
  return subscribe<WeatherData>("weather", 15 * 60_000, (data) => {
    const { sunrise, sunset } = data.today;
    const daylight = daylightLength(sunrise, sunset);
    fill(
      root,
      h(
        "div",
        { class: "st-times" },
        h(
          "div",
          { class: "st-time" },
          h("span", { class: "st-icon", "aria-hidden": "true" }, "🌅"),
          h("span", { class: "st-label" }, "Sunrise"),
          h("span", { class: "st-value" }, sunrise ? shortTime(sunrise, ctx.hour12) : "Unavailable"),
        ),
        h(
          "div",
          { class: "st-time" },
          h("span", { class: "st-icon", "aria-hidden": "true" }, "🌇"),
          h("span", { class: "st-label" }, "Sunset"),
          h("span", { class: "st-value" }, sunset ? shortTime(sunset, ctx.hour12) : "Unavailable"),
        ),
      ),
      daylight ? h("div", { class: "st-daylight" }, `☀️ ${daylight} of daylight`) : null,
    );
  });
};
