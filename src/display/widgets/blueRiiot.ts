import type { PoolData, PoolReading } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import { fmt } from "../format";
import type { Mount } from "./types";

// Blue Riiot pool monitor: one block per pool, each reading coloured by the level the server worked out from Blue
// Riiot's own ranges, and when the pool was last measured.
const EVERY = 5 * 60_000;
const LABELS: Record<PoolReading["kind"], string> = {
  temp: "Water",
  ph: "pH",
  orp: "ORP",
  chlorine: "Chlorine",
  salinity: "Salt",
};
/** A pool measured longer ago than this gets the day too, and is greyed. */
const OLD = 3 * 3_600_000;

export const blueRiiot: Mount<"blueRiiot"> = (el, w, ctx) => {
  const root = h("div", { class: "w-pool" }, h("div", { class: "w-empty" }, "Loading pool…"));
  el.append(root);
  const at = fmt(ctx.timeZone, { hour: "numeric", minute: "2-digit", hour12: ctx.hour12 });
  const day = fmt(ctx.timeZone, { month: "short", day: "numeric" });
  return subscribe<PoolData>("blueriiot", EVERY, (d) => {
    const label = w.title ? h("div", { class: "w-label" }, w.title) : null;
    if (!d.configured) return fill(root, label, h("div", { class: "w-empty" }, "Connect Blue Riiot in Settings › Pool"));
    const picked = w.pools.length ? d.pools.filter((p) => w.pools.includes(p.id)) : d.pools;
    if (!picked.length) return fill(root, label, h("div", { class: "w-empty" }, d.error ?? "No pool readings yet"));
    const now = Date.now();
    const blocks = picked.map((pool) => {
      const rows = w.readings
        .map((kind) => pool.readings.find((r) => r.kind === kind))
        .filter((r): r is PoolReading => r !== undefined)
        .map((r) =>
          h(
            "div",
            { class: `pl-r pl-${r.level}` },
            h("span", { class: "pl-dot" }),
            h("span", { class: "pl-k" }, LABELS[r.kind]),
            h(
              "span",
              { class: "pl-v" },
              String(r.value),
              r.unit ? h("small", {}, ` ${r.unit}`) : null,
              r.trend ? h("small", { class: "pl-t" }, r.trend === "up" ? " ↑" : " ↓") : null,
            ),
          ),
        );
      const old = pool.recorded !== null && now - pool.recorded > OLD;
      const when =
        pool.recorded === null ? "" : old ? `${day.format(pool.recorded)}, ${at.format(pool.recorded)}` : at.format(pool.recorded);
      return h(
        "div",
        { class: old ? "pl-pool pl-stale" : "pl-pool" },
        picked.length > 1 || !w.title ? h("div", { class: "pl-name" }, pool.name) : null,
        rows.length ? h("div", { class: "pl-grid" }, ...rows) : h("div", { class: "w-empty" }, "No readings from this pool"),
        when ? h("div", { class: "pl-when" }, `Measured ${when}`) : null,
      );
    });
    fill(root, label, ...blocks, d.stale ? h("div", { class: "pl-when" }, "Blue Riiot didn't answer; last good readings") : null);
  });
};
