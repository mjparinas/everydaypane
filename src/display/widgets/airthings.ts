import type { AirthingsData, AirthingsReading } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import { fmt } from "../format";
import type { Mount } from "./types";

// Airthings indoor air: one block per device, each reading coloured by the level the server worked out.
const EVERY = 2 * 60_000;
const LABELS: Record<AirthingsReading["kind"], string> = {
  radon: "Radon",
  co2: "CO₂",
  voc: "VOC",
  pm25: "PM2.5",
  pm1: "PM1",
  humidity: "Humidity",
  temp: "Temp",
};
/** A device that hasn't uploaded for this long says when it last did. */
const OLD = 3 * 3_600_000;

export const airthings: Mount<"airthings"> = (el, w, ctx) => {
  const root = h("div", { class: "w-airthings" }, h("div", { class: "w-empty" }, "Loading indoor air…"));
  el.append(root);
  const at = fmt(ctx.timeZone, { hour: "numeric", minute: "2-digit", hour12: ctx.hour12 });
  const day = fmt(ctx.timeZone, { month: "short", day: "numeric" });
  return subscribe<AirthingsData>("airthings", EVERY, (d) => {
    const label = w.title ? h("div", { class: "w-label" }, w.title) : null;
    if (!d.configured) return fill(root, label, h("div", { class: "w-empty" }, "Connect Airthings in Settings › Indoor air"));
    const picked = w.devices.length ? d.devices.filter((x) => w.devices.includes(x.serial)) : d.devices;
    if (!picked.length) return fill(root, label, h("div", { class: "w-empty" }, d.error ?? "No Airthings readings yet"));
    const now = Date.now();
    const blocks = picked.map((dev) => {
      const rows = w.readings
        .map((kind) => dev.readings.find((r) => r.kind === kind))
        .filter((r): r is AirthingsReading => r !== undefined)
        .map((r) =>
          h(
            "div",
            { class: `at-r at-${r.level}` },
            h("span", { class: "at-dot" }),
            h("span", { class: "at-k" }, LABELS[r.kind]),
            h("span", { class: "at-v" }, String(r.value), h("small", {}, ` ${r.unit}`)),
          ),
        );
      const old = dev.recorded !== null && now - dev.recorded > OLD;
      const when = old && dev.recorded !== null ? `${day.format(dev.recorded)}, ${at.format(dev.recorded)}` : "";
      return h(
        "div",
        { class: "at-dev" },
        picked.length > 1 || !w.title ? h("div", { class: "at-name" }, dev.name) : null,
        rows.length ? h("div", { class: "at-grid" }, ...rows) : h("div", { class: "w-empty" }, "No readings from this device"),
        old ? h("div", { class: "at-old" }, `Last reading ${when}`) : null,
      );
    });
    fill(root, label, ...blocks, d.stale ? h("div", { class: "at-old" }, "Airthings didn't answer; last good readings") : null);
  });
};
