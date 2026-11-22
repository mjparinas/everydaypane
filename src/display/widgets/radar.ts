import type { RadarData, RadarTimes } from "@/lib/display/types";
import { BLOCK, TILE } from "@/lib/radar";

import { imageUrl, refresh, subscribe } from "../api";
import { fill, h } from "../dom";
import { fmt, shortTime } from "../format";
import type { Mount } from "./types";

// Rain radar (Melvin, 2026-11-21): Environment Canada's radar over a map centred on home, played as a loop from the
// past hour (or whatever the widget asks for) into the short-term forecast. Every picture is a stacked <img> shown
// by switching its opacity, so the loop costs the screen almost nothing once the pictures are in. The map is drawn
// in two layers, the land under the radar and the place names over it, and turns dark with night mode.

export interface Frame {
  time: number;
  forecast: boolean;
}

const STEP_MS = 500;
const HOLD_MS = 2000; // on the latest observed picture and on the last one, so "now" and "later" can be read
const OLD_MS = 30 * 60_000;
const MAX_PAST = 10;
const MAX_FORECAST = 6;

/** At most `max` of the times, evenly spaced and always keeping the last one. */
export function thin(times: number[], max: number): number[] {
  if (times.length <= max) return times;
  const step = Math.ceil(times.length / max);
  return times.filter((_, i) => (times.length - 1 - i) % step === 0);
}

/** The pictures the loop plays: observed ones over the past minutes, then forecast ones. A still map shows the latest only. */
export function pickFrames(times: RadarTimes, pastMinutes: number, forecastMinutes: number, animate: boolean): Frame[] {
  const last = times.past.at(-1);
  if (last === undefined) return [];
  if (!animate) return [{ time: last, forecast: false }];
  const past = thin(
    times.past.filter((t) => t > last - pastMinutes * 60_000),
    MAX_PAST,
  );
  const ahead = thin(
    times.forecast.filter((t) => t > last && t <= last + forecastMinutes * 60_000),
    MAX_FORECAST,
  );
  return [...past.map((time) => ({ time, forecast: false })), ...ahead.map((time) => ({ time, forecast: true }))];
}

const mapMode = () => (document.documentElement.dataset.mode === "night" ? "dark" : "light");

export const radar: Mount<"radar"> = (el, w, ctx) => {
  const note = h("div", { class: "w-empty" }, "Loading the radar…");
  const root = h("div", { class: "w-radar" }, note);
  el.append(root);

  const size = BLOCK * TILE;
  const base = h("div", { class: "rd-layer" });
  const frames = h("div", { class: "rd-layer rd-frames" });
  const labels = h("div", { class: "rd-layer" });
  const home = h("div", { class: "rd-home" });
  const map = h("div", { class: "rd-map", style: `width:${size}px;height:${size}px` }, base, frames, labels, home);
  const time = h("span", { class: "rd-time" });
  const tag = h("span", { class: "rd-tag" });
  const steps = h("div", { class: "rd-steps" });
  const bar = h("div", { class: "rd-bar" }, h("div", { class: "rd-when" }, time, tag), steps);
  const credit = h("div", { class: "rd-credit" }, "Radar © Environment Canada · Map © Esri, HERE, Garmin, OpenStreetMap");

  let data: RadarData | null = null;
  let homeAt = { x: size / 2, y: size / 2 };
  let mode = "";
  let drawn = "";
  let list: Frame[] = [];
  let imgs: HTMLImageElement[] = [];
  let index = -1;
  let timer: number | undefined;
  let asked = false;

  const layout = () => {
    const cw = root.clientWidth;
    const ch = root.clientHeight;
    // Home in the middle of the cell, and the map scaled up only when the cell is bigger than it.
    const s = Math.max(1, cw / 2 / Math.min(homeAt.x, size - homeAt.x), ch / 2 / Math.min(homeAt.y, size - homeAt.y));
    map.style.transform = `translate(${Math.round(cw / 2 - s * homeAt.x)}px,${Math.round(ch / 2 - s * homeAt.y)}px) scale(${s})`;
  };

  const drawTiles = () => {
    const m = data?.maps[String(w.zoom)];
    if (!m) return;
    mode = mapMode();
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
    homeAt = { x: m.homeX, y: m.homeY };
    home.style.cssText = `left:${homeAt.x}px;top:${homeAt.y}px`;
  };

  const loaded = (img: HTMLImageElement | undefined) => !!img && img.complete && img.naturalWidth > 0;

  const show = (i: number) => {
    const f = list[i];
    if (!f) return;
    imgs[index]?.classList.remove("on");
    imgs[i]?.classList.add("on");
    steps.children[index]?.classList.remove("on");
    steps.children[i]?.classList.add("on");
    index = i;
    time.textContent = shortTime(
      `T${fmt(ctx.timeZone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(f.time)}`,
      ctx.hour12,
    );
    const latest = i === lastPast();
    const late = latest && Date.now() - f.time > OLD_MS;
    tag.textContent = f.forecast ? "Forecast" : late ? "Radar delayed" : latest ? "Latest" : "";
    tag.className = `rd-tag${f.forecast ? " rd-ahead" : ""}`;
  };

  const lastPast = () => {
    let i = -1;
    list.forEach((f, j) => !f.forecast && (i = j));
    return i;
  };

  const tick = () => {
    window.clearTimeout(timer);
    if (mapMode() !== mode) drawTiles();
    // The next picture that has loaded (one still loading, or that failed, is skipped this time round).
    let next = -1;
    for (let k = 1; k <= list.length; k++) {
      const j = (index + k) % list.length;
      if (loaded(imgs[j])) {
        next = j;
        break;
      }
    }
    if (next >= 0 && next !== index) show(next);
    const hold = index === lastPast() || index === list.length - 1;
    timer = window.setTimeout(tick, list.length > 1 ? (hold ? HOLD_MS : STEP_MS) : 60_000);
  };

  const draw = () => {
    if (!data) return;
    const times = data.layers[w.precip];
    if (!times || !data.maps[String(w.zoom)]) {
      // The feed was read before this widget's settings were saved: ask again, once.
      if (!asked) {
        asked = true;
        refresh("radar");
      }
      return;
    }
    const picked = pickFrames(times, w.pastMinutes, w.forecastMinutes, w.animate);
    if (!picked.length) {
      window.clearTimeout(timer);
      drawn = "";
      fill(root, h("div", { class: "w-empty" }, times.error ? "The radar is unavailable right now." : "No radar pictures right now."));
      return;
    }
    if (!root.contains(map)) {
      fill(root, map, bar, credit);
      drawTiles();
    }
    const sig = picked.map((f) => `${f.time}${f.forecast ? "f" : ""}`).join(",");
    if (sig === drawn) return;
    drawn = sig;
    // Keep the pictures already loaded; forecast ones are asked again, since each forecast run redraws them.
    const old = new Map<string, HTMLImageElement | undefined>(list.map((f, i) => [`${f.time}${f.forecast ? "f" : ""}`, imgs[i]]));
    const current = list[index];
    list = picked;
    imgs = picked.map((f) => {
      const key = `${f.time}${f.forecast ? "f" : ""}`;
      const keep = !f.forecast ? old.get(key) : undefined;
      if (keep) return keep;
      return h("img", {
        class: "rd-frame",
        alt: "",
        decoding: "async",
        src: imageUrl("radar/frame", { p: w.precip, z: String(w.zoom), time: String(f.time) }),
      });
    });
    fill(frames, ...imgs);
    fill(steps, ...picked.map((f) => h("span", { class: f.forecast ? "rd-step rd-ahead" : "rd-step" })));
    index = -1;
    const resume = current ? list.findIndex((f) => f.time === current.time) : -1;
    // Start on the latest observed picture, so the first thing on screen is the rain now.
    const start = resume >= 0 ? resume : lastPast();
    const first = imgs[start];
    if (first) {
      if (loaded(first)) show(start);
      else first.addEventListener("load", () => index < 0 && show(start), { once: true });
    }
    layout();
    window.clearTimeout(timer);
    timer = window.setTimeout(tick, HOLD_MS);
  };

  const stopFeed = subscribe<RadarData>("radar", 5 * 60_000, (d) => {
    data = d;
    draw();
  });
  const resize = typeof ResizeObserver === "function" ? new ResizeObserver(layout) : null;
  resize?.observe(root);

  return () => {
    stopFeed();
    resize?.disconnect();
    window.clearTimeout(timer);
  };
};
