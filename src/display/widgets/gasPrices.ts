import { GAS_FUEL_LABELS, gasPriceText, gasRows, type GasData } from "@/lib/gas";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import { fmt } from "../format";
import type { Mount } from "./types";

// Local gas prices (Melvin, 2026-11-26): one row per station with its price for the widget's fuel, the cheapest
// marked, its distance from home and how old the price is. The server reads Google every two hours; the wall asks
// every 15 minutes so a new read shows soon after it lands. Google's terms want its name on Places data shown off a
// Google map, so the foot always says "Google Maps".
const EVERY = 15 * 60_000;

/** "just now", "40 min ago", "3 h ago", "2 days ago". */
export function ageText(at: number, now = Date.now()): string {
  if (!at) return "";
  const min = Math.max(0, Math.round((now - at) / 60_000));
  if (min < 5) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  return hr < 24 ? `${hr} h ago` : `${Math.round(hr / 24)} day${Math.round(hr / 24) === 1 ? "" : "s"} ago`;
}

export const gasPrices: Mount<"gasPrices"> = (el, w, ctx) => {
  const root = h("div", { class: "w-gas" }, h("div", { class: "w-empty" }, "Loading gas prices…"));
  el.append(root);
  const at = fmt(ctx.timeZone, { hour: "numeric", minute: "2-digit", hour12: ctx.hour12 });
  const imperial = ctx.payload.units === "imperial";
  return subscribe<GasData>("gas", EVERY, (d) => {
    const label = h("div", { class: "w-label" }, w.title || `${GAS_FUEL_LABELS[w.fuel]} gas`);
    if (d.missing === "key") return fill(root, label, h("div", { class: "w-empty" }, "Gas prices aren't set up yet"));
    const now = Date.now();
    const rows = gasRows(d.stations, w, now);
    if (!rows.length)
      return fill(
        root,
        label,
        h("div", { class: "w-empty" }, d.error ? "Gas prices unavailable" : `No ${GAS_FUEL_LABELS[w.fuel].toLowerCase()} prices nearby`),
      );
    const cheapest = Math.min(...rows.map((r) => r.price.price));
    const many = rows.filter((r) => r.price.price === cheapest).length;
    const list = rows.map(({ station, price }) => {
      const dist = imperial ? `${(station.km * 0.621371).toFixed(1)} mi` : `${station.km.toFixed(1)} km`;
      const meta = [dist, ageText(price.at, now)].filter(Boolean).join(" · ");
      return h(
        "div",
        { class: `gas-row${price.price === cheapest && rows.length > many ? " gas-best" : ""}` },
        h("span", { class: "gas-price" }, gasPriceText(price.price, station.currency)),
        h(
          "span",
          { class: "gas-where" },
          h("span", { class: "gas-name" }, station.name),
          w.showAddress && station.address ? h("small", { class: "gas-addr" }, station.address) : null,
        ),
        h("small", { class: "gas-meta" }, meta),
      );
    });
    fill(
      root,
      label,
      h("div", { class: "gas-list" }, ...list),
      h("div", { class: "gas-foot" }, `Updated ${at.format(d.updatedAt)} · Google Maps`),
    );
  });
};
