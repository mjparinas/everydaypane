import type { FireStage, WildfireData, WildfireFire, WildfireMap } from "@/lib/display/types";
import { BLOCK, TILE } from "@/lib/radar";

import { imageUrl, refresh, subscribe } from "../api";
import { fill, h } from "../dom";
import type { Mount } from "./types";

// Wildfires (Melvin, 2026-11-21): BC Wildfire Service's active fires on the radar's map around home, with the burned
// area of each, evacuation orders and alerts, and the nearest fires listed along the bottom. The server sends
// everything as pixels on the map (src/server/wildfires.ts), so drawing it is one SVG laid over the tiles. Nothing
// moves, so between feed reads the widget costs the screen nothing; the map turns dark with night mode.

const SVG = "http://www.w3.org/2000/svg";
const s = (tag: string, attrs: Record<string, string | number>) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

export const STAGE_LABEL: Record<FireStage, string> = {
  new: "New",
  outOfControl: "Out of control",
  held: "Being held",
  underControl: "Under control",
};

/** The fires a widget shows: all of them, or only those not yet under control. */
export const shownFires = (fires: WildfireFire[], showControlled: boolean) =>
  showControlled ? fires : fires.filter((f) => f.stage !== "underControl");

/** "120 ha", "1,250 ha", "0.5 ha"; under a tenth of a hectare is a spot fire. */
export function hectares(ha: number): string {
  if (ha < 0.1) return "Spot fire";
  return `${ha < 10 ? ha.toFixed(1).replace(/\.0$/, "") : Math.round(ha).toLocaleString("en-CA")} ha`;
}

/** A marker's radius in map pixels: bigger fires and fires of note stand out. */
const radius = (f: WildfireFire) => (f.ofNote ? 9 : f.ha >= 1000 ? 8 : f.ha >= 10 ? 6.5 : 5);

const mapMode = () => (document.documentElement.dataset.mode === "night" ? "dark" : "light");

export const wildfires: Mount<"wildfires"> = (el, w) => {
  const note = h("div", { class: "w-empty" }, "Loading wildfires…");
  const root = h("div", { class: "w-radar w-fires" }, note);
  el.append(root);

  const size = BLOCK * TILE;
  const base = h("div", { class: "rd-layer" });
  const labels = h("div", { class: "rd-layer" });
  const overlay = s("svg", { class: "rd-layer wf-svg", viewBox: `0 0 ${size} ${size}`, width: size, height: size });
  const home = h("div", { class: "rd-home" });
  const map = h("div", { class: "rd-map", style: `width:${size}px;height:${size}px` }, base, overlay, labels, home);
  const list = h("div", { class: "wf-list" });
  const credit = h("div", { class: "rd-credit" }, "Fires © BC Wildfire Service · Map © Esri, HERE, Garmin, OpenStreetMap");

  let data: WildfireData | null = null;
  let homeAt = { x: size / 2, y: size / 2 };
  let mode = "";
  let tilesFor = "";
  let asked = false;

  const layout = () => {
    const cw = root.clientWidth;
    const ch = root.clientHeight;
    // Home in the middle of the cell, and the map scaled up only when the cell is bigger than it (as on the radar).
    const k = Math.max(1, cw / 2 / Math.min(homeAt.x, size - homeAt.x), ch / 2 / Math.min(homeAt.y, size - homeAt.y));
    map.style.transform = `translate(${Math.round(cw / 2 - k * homeAt.x)}px,${Math.round(ch / 2 - k * homeAt.y)}px) scale(${k})`;
  };

  const drawTiles = (m: WildfireMap) => {
    mode = mapMode();
    tilesFor = `${mode}:${m.x}:${m.y}`;
    const tiles = (style: string) => {
      const out: HTMLImageElement[] = [];
      for (let y = 0; y < BLOCK; y++)
        for (let x = 0; x < BLOCK; x++) {
          const src = imageUrl("radar/tile", { s: style, z: String(w.zoom), x: String(m.x + x), y: String(m.y + y) });
          out.push(h("img", { class: "rd-tile", alt: "", src, style: `left:${x * TILE}px;top:${y * TILE}px` }));
        }
      return out;
    };
    fill(base, ...tiles(mode));
    fill(labels, ...tiles(`${mode}-labels`));
  };

  const draw = () => {
    const m = data?.maps[String(w.zoom)];
    if (!m) {
      if (data?.error) {
        fill(root, h("div", { class: "w-empty" }, "Wildfires are unavailable right now."));
      } else if (data && !asked) {
        // The feed was read before this widget's settings were saved: ask again, once.
        asked = true;
        refresh("wildfires");
      }
      return;
    }
    if (!root.contains(map)) fill(root, map, list, credit);
    if (tilesFor !== `${mapMode()}:${m.x}:${m.y}`) drawTiles(m);
    homeAt = { x: m.homeX, y: m.homeY };
    home.style.cssText = `left:${homeAt.x}px;top:${homeAt.y}px`;

    const fires = shownFires(m.fires, w.showControlled);
    const shapes: SVGElement[] = [];
    if (w.showEvacuations)
      for (const e of m.evacuations) shapes.push(s("path", { class: `wf-evac wf-${e.kind}`, d: e.d, "fill-rule": "evenodd" }));
    if (w.showPerimeters) for (const d of m.perimeters) shapes.push(s("path", { class: "wf-perimeter", d, "fill-rule": "evenodd" }));
    // Smallest last, so a spot fire next to a big one isn't hidden under it.
    for (const f of [...fires].sort((a, b) => radius(b) - radius(a))) {
      shapes.push(s("circle", { class: `wf-fire wf-${f.stage}${f.ofNote ? " wf-note" : ""}`, cx: f.x, cy: f.y, r: radius(f) }));
    }
    overlay.replaceChildren(...shapes);

    const nearest = fires.slice(0, w.listCount);
    fill(
      list,
      ...(w.listCount === 0
        ? []
        : nearest.length
          ? nearest.map((f) =>
              h(
                "div",
                { class: "wf-row" },
                h("span", { class: `wf-dot wf-${f.stage}` }),
                h("span", { class: "wf-name" }, f.name),
                h("span", { class: "wf-meta" }, `${f.km} km · ${hectares(f.ha)} · ${STAGE_LABEL[f.stage]}`),
              ),
            )
          : [h("div", { class: "wf-row wf-none" }, "No active wildfires on this map")]),
    );
    list.hidden = w.listCount === 0;
    layout();
  };

  const stopFeed = subscribe<WildfireData>("wildfires", 5 * 60_000, (d) => {
    data = d;
    draw();
  });
  // Night mode can change without a new feed: check the map's colours once a minute.
  const timer = window.setInterval(() => {
    if (data && mapMode() !== mode) draw();
  }, 60_000);
  const resize = typeof ResizeObserver === "function" ? new ResizeObserver(layout) : null;
  resize?.observe(root);

  return () => {
    stopFeed();
    window.clearInterval(timer);
    resize?.disconnect();
  };
};
