import type { AirData } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import type { Mount } from "./types";

// Canada's AQHI bands (Health Canada) and the US EPA's AQI bands.
export function aqhiBand(v: number): { name: string; level: number } {
  if (v <= 3) return { name: "Low risk", level: 1 };
  if (v <= 6) return { name: "Moderate risk", level: 2 };
  if (v <= 10) return { name: "High risk", level: 3 };
  return { name: "Very high risk", level: 4 };
}

export function usAqiBand(v: number): { name: string; level: number } {
  if (v <= 50) return { name: "Good", level: 1 };
  if (v <= 100) return { name: "Moderate", level: 2 };
  if (v <= 150) return { name: "Unhealthy for some", level: 3 };
  if (v <= 200) return { name: "Unhealthy", level: 4 };
  return { name: "Very unhealthy", level: 5 };
}

export const airQuality: Mount<"airQuality"> = (el, w) => {
  const root = h("div", { class: "w-air" }, h("div", { class: "w-empty" }, "Checking the air…"));
  el.append(root);
  return subscribe<AirData>("air", 30 * 60_000, (d) => {
    const value = w.scale === "aqhi" ? d.aqhi : d.usAqi;
    const band = w.scale === "aqhi" ? aqhiBand(value) : usAqiBand(value);
    const max = w.scale === "aqhi" ? 11 : 300;
    const bar = h(
      "div",
      { class: "air-bar" },
      h("div", { class: "air-fill", style: `transform:scaleX(${Math.min(1, value / max).toFixed(3)})` }),
    );
    fill(
      root,
      h("div", { class: "w-label" }, w.title || (w.scale === "aqhi" ? "Air quality (AQHI)" : "Air quality (US AQI)")),
      h(
        "div",
        { class: `air-row air-${band.level}` },
        h("div", { class: "air-value" }, w.scale === "aqhi" && value > 10 ? "10+" : String(value)),
        h("div", { class: "air-name" }, band.name),
      ),
      bar,
      h("div", { class: "w-sub" }, `PM2.5 ${d.pm25} µg/m³`),
    );
    root.dataset.level = String(band.level);
  });
};
