import type { DriveBcData } from "@/lib/display/types";
import { DRIVEBC_CREDIT } from "@/lib/drivebc";

import { imageUrl, subscribe } from "../api";
import { fill, h, setText, underSaver } from "../dom";
import { fmt } from "../format";
import type { Mount } from "./types";

// DriveBC highway cameras (Melvin, 2026-11-25): each picked camera's latest still picture, side by side or one at a
// time. A new picture is loaded off screen and swapped in when it arrives (like the Camera widget), and nothing is
// fetched while the screen saver is up or the page is hidden; waking fetches whatever went out of date meanwhile.
// The status feed (names, last new picture, late or off) is small and changes slowly.

const FEED_EVERY = 5 * 60_000;
const RETRY_MS = 60_000;

interface Tile {
  id: string;
  box: HTMLElement;
  img: HTMLImageElement;
  note: HTMLElement;
  /** When the shown picture was fetched, or the next try is due from (0 = never tried). */
  at: number;
  loaded: boolean;
  loading: boolean;
  failed: boolean;
  n: number;
}

export const drivebc: Mount<"drivebc"> = (el, w, ctx) => {
  const paused = () => document.hidden || underSaver(el);
  if (w.cameras.length === 0) {
    el.append(h("div", { class: "w-empty" }, "Pick highway cameras in this widget's settings."));
    return () => undefined;
  }
  const cycle = w.layout === "cycle" && w.cameras.length > 1;
  const refreshMs = w.refreshSeconds * 1000;
  const at = fmt(ctx.timeZone, { hour: "numeric", minute: "2-digit", hour12: ctx.hour12 });
  let status: DriveBcData | null = null;
  let shown = 0;
  let stopped = false;

  const tiles: Tile[] = w.cameras.map((c) => {
    const img = h("img", { class: "dbc-img", alt: c.name || "Highway Camera", draggable: "false" });
    const note = h("span", { class: "dbc-note" });
    const name = w.showName ? h("span", { class: "dbc-name" }, c.name) : null;
    const box = h("div", { class: "dbc-cam" }, img, h("div", { class: "dbc-bar" }, name, note));
    return { id: c.id, box, img, note, at: 0, loaded: false, loading: false, failed: false, n: 0 };
  });
  const grid = h("div", { class: `dbc-grid dbc-n${cycle ? 1 : tiles.length}` }, ...tiles.map((t) => t.box));
  const credit = h("div", { class: "dbc-credit" }, DRIVEBC_CREDIT);
  const title = w.title ? h("div", { class: "dbc-title" }, w.title) : null;
  const root = h("div", { class: "w-drivebc" }, grid, title, credit);
  el.append(root);

  const label = (t: Tile) => {
    const s = status?.cameras.find((c) => c.id === t.id);
    const text =
      s?.state === "off"
        ? "Camera Off"
        : t.failed && !t.loaded
          ? "Picture unavailable"
          : s?.state === "late"
            ? `Delayed · ${s.updated ? at.format(s.updated) : "no new picture"}`
            : s?.updated
              ? at.format(s.updated)
              : "";
    setText(t.note, text);
    t.box.classList.toggle("late", s?.state === "late" || s?.state === "off");
  };

  const load = (t: Tile) => {
    if (t.loading || stopped) return;
    t.loading = true;
    const next = new Image();
    next.onload = () => {
      t.loading = false;
      if (stopped) return;
      t.img.src = next.src;
      t.at = Date.now();
      t.loaded = true;
      t.failed = false;
      label(t);
    };
    next.onerror = () => {
      t.loading = false;
      if (stopped) return;
      t.failed = true;
      // Try again in a minute rather than waiting a whole refresh.
      t.at = Math.max(t.at, Date.now() - refreshMs + RETRY_MS);
      label(t);
    };
    next.src = imageUrl("drivebc/image", { c: t.id, n: String(t.n++) });
  };

  const visible = () => (cycle ? [tiles[shown]!] : tiles);
  const sync = () => {
    if (stopped || paused()) return;
    const now = Date.now();
    for (const t of visible()) if (now - t.at >= refreshMs) load(t);
  };
  const show = (i: number) => {
    shown = i;
    tiles.forEach((t, j) => t.box.classList.toggle("on", j === i));
    sync();
  };

  if (cycle) show(0);
  else sync();
  const tick = window.setInterval(sync, 15_000);
  const turn = cycle ? window.setInterval(() => paused() || show((shown + 1) % tiles.length), w.cycleSeconds * 1000) : undefined;
  const watch = new MutationObserver(sync);
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  document.addEventListener("visibilitychange", sync);
  const stopFeed = subscribe<DriveBcData>("drivebc", FEED_EVERY, (d) => {
    status = d;
    tiles.forEach(label);
  });

  return () => {
    stopped = true;
    window.clearInterval(tick);
    if (turn !== undefined) window.clearInterval(turn);
    watch.disconnect();
    document.removeEventListener("visibilitychange", sync);
    stopFeed();
    fill(root);
  };
};
