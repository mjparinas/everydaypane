import type { HaControl } from "@/lib/config/schema";
import type { HaData, HaEntity } from "@/lib/display/types";

import { imageUrl, refresh, send, subscribe } from "../api";
import { fill, h, setText } from "../dom";
import type { Mount } from "./types";

// Home Assistant tiles and UniFi Protect cameras. Every tap goes to our server, which only passes on a fixed set of
// actions for entities a widget shows (src/server/homeassistant.ts); unlocking is never offered. States come from one
// shared five-second feed, so ten tiles still make one request.

export const HA_EVERY = 5000;

type Kind = Exclude<HaControl, "auto">;

/** The control an entity gets when the widget says "auto". */
export function controlFor(entityId: string, control: HaControl): Kind {
  if (control !== "auto") return control;
  const domain = entityId.split(".")[0] ?? "";
  if (domain === "light") return "light";
  if (["switch", "fan", "input_boolean", "media_player", "humidifier", "siren"].includes(domain)) return "toggle";
  if (domain === "climate" || domain === "cover" || domain === "lock") return domain;
  if (["scene", "script", "button", "input_button"].includes(domain)) return "button";
  return "sensor";
}

const OPEN_CLOSED = new Set(["door", "garage_door", "opening", "window"]);

/** A state as a person says it: "21.5 °C", "Open", "Detected". */
export function stateText(e: HaEntity): string {
  const s = e.state;
  if (s === "unavailable" || s === "unknown") return "Unavailable";
  if (e.id.startsWith("binary_sensor.")) {
    const on = s === "on";
    if (e.deviceClass && OPEN_CLOSED.has(e.deviceClass)) return on ? "Open" : "Closed";
    if (e.deviceClass === "motion" || e.deviceClass === "occupancy" || e.deviceClass === "presence") return on ? "Detected" : "Clear";
    if (e.deviceClass === "moisture") return on ? "Wet" : "Dry";
    return on ? "On" : "Off";
  }
  const n = Number(s);
  if (s.trim() !== "" && Number.isFinite(n)) {
    const v = Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
    return e.unit ? `${v}${e.unit === "%" ? "" : " "}${e.unit}` : v;
  }
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

const isOn = (e: HaEntity) => ["on", "open", "opening", "playing", "heat", "cool", "heat_cool", "auto"].includes(e.state);
const dead = (e: HaEntity) => e.state === "unavailable" || e.state === "unknown";

export const haEntity: Mount<"haEntity"> = (el, w) => {
  const kind = controlFor(w.entityId, w.control);
  const root = h("div", { class: `w-ha ha-${kind}` }, h("div", { class: "w-empty" }, "Loading…"));
  el.append(root);
  let entity: HaEntity | null = null;
  let drawnKey = "";
  let pendingTarget: number | null = null;
  let sendTimer: number | undefined;
  let message = "";
  let messageTimer: number | undefined;

  const act = async (action: string, value?: number) => {
    const ok = await send("ha", { entity: w.entityId, action, value });
    say(ok ? "" : "Couldn't reach Home Assistant");
    window.setTimeout(() => refresh("ha"), 400);
  };
  const say = (text: string) => {
    message = text;
    drawnKey = "";
    draw();
    window.clearTimeout(messageTimer);
    if (text) messageTimer = window.setTimeout(() => say(""), 4000);
  };
  const btn = (label: string, onTap: () => void, cls = "ha-btn", disabled = false) => {
    const b = h("button", { type: "button", class: cls, disabled }, label);
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      onTap();
    });
    return b;
  };

  const draw = () => {
    if (!entity) return;
    const e = entity;
    const key = `${e.state}|${e.brightness}|${e.current}|${e.target}|${pendingTarget}|${message}|${e.name}`;
    if (key === drawnKey) return;
    drawnKey = key;
    const name = h("div", { class: "w-label" }, w.title || e.name);
    const note = message ? h("div", { class: "ha-msg" }, message) : null;
    root.classList.toggle("on", isOn(e));
    root.classList.toggle("dead", dead(e));

    if (kind === "sensor") return fill(root, name, h("div", { class: "ha-value" }, stateText(e)));

    if (kind === "toggle" || kind === "light") {
      // A real switch that still fills the tile (a11y audit, 2026-11-22): keyboard and AT can use it; brightness stays
      // outside the button so we don't nest interactive controls.
      const on = isOn(e);
      const switchBtn = h(
        "button",
        {
          type: "button",
          class: "ha-switch",
          role: "switch",
          "aria-checked": on ? "true" : "false",
          "aria-label": w.title || e.name,
          disabled: dead(e) ? true : undefined,
        },
        name,
        h("div", { class: "ha-value" }, stateText(e)),
      );
      if (!dead(e)) {
        switchBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          void act("toggle");
        });
      }
      const parts = [switchBtn, note];
      if (kind === "light" && e.state === "on" && e.brightness !== undefined) {
        const pct = Math.max(1, Math.round((e.brightness / 255) * 100));
        const range = h("input", { type: "range", class: "ha-range", min: 1, max: 100, value: pct, "aria-label": "Brightness" });
        range.addEventListener("click", (ev) => ev.stopPropagation());
        range.addEventListener("change", () => void act("brightness", Number(range.value)));
        parts.push(range);
      }
      return fill(root, ...parts);
    }

    if (kind === "climate") {
      const step = e.step ?? 0.5;
      const target = pendingTarget ?? e.target;
      const unit = e.unit ?? "°";
      const nudge = (d: number) => {
        if (target === undefined) return;
        const min = e.min ?? 5;
        const max = e.max ?? 35;
        pendingTarget = Math.min(max, Math.max(min, Math.round((target + d) / step) * step));
        drawnKey = "";
        draw();
        // Taps in a row send one change, after the last.
        window.clearTimeout(sendTimer);
        sendTimer = window.setTimeout(() => {
          const t = pendingTarget;
          pendingTarget = null;
          if (t !== null) void act("temperature", t);
        }, 900);
      };
      return fill(
        root,
        name,
        h("div", { class: "ha-value" }, e.current !== undefined ? `${Math.round(e.current * 10) / 10}${unit}` : stateText(e)),
        h(
          "div",
          { class: "ha-climate" },
          btn("−", () => nudge(-step), "ha-btn ha-round", dead(e) || target === undefined),
          h(
            "div",
            { class: "ha-target" },
            target !== undefined ? `Set to ${target}${unit}` : stateText(e),
            e.action ? h("small", {}, e.action) : null,
          ),
          btn("+", () => nudge(step), "ha-btn ha-round", dead(e) || target === undefined),
        ),
        note,
      );
    }

    if (kind === "cover")
      return fill(
        root,
        name,
        h("div", { class: "ha-value" }, stateText(e)),
        h(
          "div",
          { class: "ha-row" },
          btn("Open", () => void act("open"), "ha-btn", dead(e)),
          btn("Stop", () => void act("stop"), "ha-btn", dead(e)),
          btn("Close", () => void act("close"), "ha-btn", dead(e)),
        ),
        note,
      );

    if (kind === "lock")
      // Lock only (Melvin's wall screen is in a shared room): an unlocked door can be locked, never the reverse.
      return fill(
        root,
        name,
        h("div", { class: "ha-value" }, stateText(e)),
        e.state === "locked" || dead(e) ? null : btn("Lock", () => void act("lock")),
        note,
      );

    return fill(
      root,
      name,
      btn(w.title || e.name, () => void act("press").then(() => !message && say("Done")), "ha-btn ha-big", dead(e)),
      note,
    );
  };

  const stop = subscribe<HaData>("ha", HA_EVERY, (d) => {
    if (!d.configured) return fill(root, h("div", { class: "w-empty" }, "Set up Home Assistant under Settings in the admin panel."));
    const e = d.entities[w.entityId];
    if (!e) {
      entity = null;
      drawnKey = "";
      return fill(root, h("div", { class: "w-empty" }, w.entityId ? `${w.entityId} wasn't found` : "Pick an entity for this widget."));
    }
    entity = e;
    draw();
  });
  return () => {
    stop();
    window.clearTimeout(sendTimer);
    window.clearTimeout(messageTimer);
    // A temperature still waiting out the 900 ms pause would be lost when the tile unmounts.
    if (pendingTarget !== null) void send("ha", { entity: w.entityId, action: "temperature", value: pendingTarget });
  };
};

/**
 * Keeps an image showing a camera's latest picture. Each frame is loaded off screen and swapped in when it arrives,
 * so the picture never flashes blank; a hidden page fetches nothing.
 */
export function cameraLoop(img: HTMLImageElement, entityId: string, everyMs: number, onError: (failed: boolean) => void): () => void {
  let timer: number | undefined;
  let stopped = false;
  let n = 0;
  const tick = () => {
    if (stopped) return;
    if (document.hidden) {
      timer = window.setTimeout(tick, everyMs);
      return;
    }
    const next = new Image();
    next.onload = () => {
      if (stopped) return;
      img.src = next.src;
      onError(false);
      timer = window.setTimeout(tick, everyMs);
    };
    next.onerror = () => {
      if (stopped) return;
      onError(true);
      timer = window.setTimeout(tick, Math.max(everyMs, 10_000));
    };
    next.src = imageUrl("camera", { e: entityId, n: String(n++) });
  };
  tick();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}

export const camera: Mount<"camera"> = (el, w) => {
  if (!w.entityId) {
    el.append(h("div", { class: "w-empty" }, "Pick a camera for this widget."));
    return () => undefined;
  }
  const img = h("img", { class: "cam-img", alt: w.title || "Camera" });
  const status = h("div", { class: "cam-status" });
  const label = w.title ? h("div", { class: "cam-label" }, w.title) : null;
  el.append(h("div", { class: "w-camera" }, img, label, status));
  return cameraLoop(img, w.entityId, w.refreshSeconds * 1000, (failed) => setText(status, failed ? "Camera offline" : ""));
};
