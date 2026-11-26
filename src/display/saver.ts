import { minutesInZone } from "@/lib/config/time";
import type { DisplayPayload, HaData } from "@/lib/display/types";
import { saverMode, type SaverMode } from "@/lib/screenSaver";

import { PREVIEW, subscribe } from "./api";
import { h } from "./dom";
import { fmt } from "./format";
import { everyMinute } from "./ticker";
import { HA_EVERY } from "./widgets/ha";
import { photos } from "./widgets/photos";

// The screen saver (Melvin, 2026-11-21): after some minutes with nobody using the screen it shows only photos or goes
// dark, and during the night window it goes dark. A touch, a key, a Home Assistant motion sensor, a doorbell ring or a
// new emergency alert wakes it. The dashboard underneath stays mounted (so it is up to date the moment it wakes) but
// hidden, so the browser stops painting it. A tap on the saver only wakes the screen; it never reaches a widget.

const CHECK_MS = 15_000;

export interface Saver {
  /** Something happened that means someone is here. */
  wake(): void;
  /** The settings changed. */
  update(): void;
  readonly mode: SaverMode;
}

/**
 * Draws a view into the saver (the idle view, Melvin 2026-11-26) and returns how to take it down, or null when the
 * view is gone. main.ts supplies it, because it owns the widget mounting and the theme.
 */
export type MountIdleView = (into: HTMLElement, viewId: string) => (() => void) | null;

export function screenSaver(
  app: HTMLElement,
  getPayload: () => DisplayPayload | null,
  now = () => Date.now(),
  mountIdleView?: MountIdleView,
): Saver {
  const el = h("div", { class: "saver", "aria-hidden": "true" });
  app.append(el);
  const loadedAt = now();
  let lastActivity = -Infinity;
  let mode: SaverMode = "off";
  let stopShow: (() => void) | null = null;
  let motion: { key: string; stop: () => void } | null = null;

  const draw = (next: SaverMode) => {
    if (next === mode) return;
    // The mode changes before the old show is taken down, so the idle view's cleanup (which puts the dashboard's
    // theme back) already sees the saver as off.
    const stop = stopShow;
    stopShow = null;
    mode = next;
    stop?.();
    el.replaceChildren();
    el.className = next === "off" ? "saver" : `saver show saver-${next}`;
    document.documentElement.classList.toggle("saving", next !== "off");
    if (next === "view") {
      const id = getPayload()?.screenSaver.viewId;
      stopShow = (id && mountIdleView?.(el, id)) || null;
      // The idle view was deleted after this page loaded its settings: photos, as before the idle view existed.
      if (!stopShow) {
        el.className = "saver show saver-photos";
        stopShow = drawPhotos();
      }
    } else if (next === "photos") stopShow = drawPhotos();
  };

  const drawPhotos = () => {
    const p = getPayload();
    if (!p) return null;
    const s = p.screenSaver;
    // The photos widget, filling the screen: it already shuffles, cross-fades and asks for photos at screen width.
    const stops = [
      photos(
        el,
        {
          id: "saver",
          type: "photos",
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          showBackground: false,
          sourceIds: s.photoSourceIds,
          intervalSeconds: 30,
          fit: "auto",
          showCaption: true,
          pairPortraits: true,
          drift: true,
          memories: true,
        },
        {
          payload: p,
          timeZone: p.location.timeZone,
          hour12: p.hour12,
        },
      ),
    ];
    if (s.showClock) {
      const time = h("div", { class: "sv-time" });
      const date = h("div", { class: "sv-date" });
      const clock = h("div", { class: "sv-clock" }, time, date);
      el.append(clock);
      const tz = p.location.timeZone;
      stops.push(
        everyMinute((d) => {
          // The clock is the one thing that stays put on the photo saver, so it wanders a little against burn-in.
          clock.style.translate = `${Math.round(Math.random() * 40)}px ${-Math.round(Math.random() * 30)}px`;
          time.textContent = fmt(tz, { hour: "numeric", minute: "2-digit", hour12: p.hour12 }).format(d);
          date.textContent = fmt(tz, { weekday: "long", month: "long", day: "numeric" }).format(d);
        }),
      );
    }
    return () => {
      for (const s of stops) s();
    };
  };

  const check = () => {
    const p = getPayload();
    // An admin's preview always shows the dashboard.
    if (!p || PREVIEW) return draw("off");
    const t = now();
    draw(saverMode(p.screenSaver, { now: t, minute: minutesInZone(new Date(t), p.location.timeZone), lastActivity, loadedAt }));
  };

  const wake = () => {
    lastActivity = now();
    check();
  };

  // A touch on the dashboard counts as use. A touch on the saver is handled by its own click, so the same tap can't
  // also press whatever widget is underneath once the saver is gone.
  document.addEventListener("pointerdown", () => mode === "off" && wake(), { capture: true, passive: true });
  document.addEventListener("keydown", wake, { capture: true });
  el.addEventListener("pointerdown", (e) => e.preventDefault());
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    wake();
  });
  window.setInterval(check, CHECK_MS);

  const update = () => {
    const ids = getPayload()?.screenSaver.motionEntityIds.filter(Boolean) ?? [];
    const key = ids.join(",");
    if (motion?.key !== key) {
      motion?.stop();
      motion = null;
      if (ids.length)
        motion = {
          key,
          // While any motion sensor is on, someone is there.
          stop: subscribe<HaData>("ha", HA_EVERY, (d) => ids.some((id) => d.entities[id]?.state === "on") && wake()),
        };
    }
    // New settings (another photo album, the clock switched off) are drawn fresh.
    const was = mode;
    draw("off");
    if (was !== "off") draw(was);
    check();
  };

  return {
    wake,
    update,
    get mode() {
      return mode;
    },
  };
}
