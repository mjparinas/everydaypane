import type { HaControl } from "@/lib/config/schema";
import type { HaData, HaEntity } from "@/lib/display/types";
import { LIGHT_PROVIDERS, nativeProviderFromEntity } from "@/lib/smartHome";

import { refresh, send, subscribe } from "../api";
import { fill, h } from "../dom";
import { HA_EVERY } from "./ha";
import type { Mount } from "./types";

// Smart device tiles (Home Assistant, Nest, ecobee, SmartThings, Govee, Philips Hue, LIFX). Every tap goes to our server, which only passes
// on a fixed set of actions for entities a widget shows (src/server/homeassistant.ts); unlocking is never offered.
// States come from one shared five-second feed, so ten tiles still make one request. Loaded on its own
// (src/display/widgets/lazy.ts, 2026-11-25) so screens without a tile don't carry it.
export const LOCK_HOLD_MS = 700;
export function completesLockHold(startedAt: number | null, now: number = performance.now()): boolean {
  return startedAt !== null && now - startedAt >= LOCK_HOLD_MS;
}

type Kind = Exclude<HaControl, "auto">;

/** The control an entity gets when the widget says "auto". */
export function controlFor(entityId: string, control: HaControl): Kind {
  if (control !== "auto") return control;
  const native = nativeProviderFromEntity(entityId);
  if (native && LIGHT_PROVIDERS.includes(native)) return "light";
  if (native) {
    if (entityId.startsWith("smartthings.") && entityId.includes("lock")) return "lock";
    return "climate";
  }
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

/** Colours a tap can set on a colour light: warm white first, then a few bright ones. */
export const LIGHT_COLOURS: readonly [string, string][] = [
  ["#ffd9a8", "Warm white"],
  ["#ffffff", "White"],
  ["#ff3b30", "Red"],
  ["#ff9500", "Orange"],
  ["#34c759", "Green"],
  ["#0a84ff", "Blue"],
  ["#af52de", "Purple"],
  ["#ff2d92", "Pink"],
];

function swatches(current: string, onPick: (rgb: number) => void): HTMLElement {
  const row = h("div", { class: "ha-swatches", role: "group", "aria-label": "Colour" });
  for (const [hex, label] of LIGHT_COLOURS) {
    const b = h("button", {
      type: "button",
      class: hex === current.toLowerCase() ? "ha-swatch on" : "ha-swatch",
      "aria-label": label,
    });
    // Through the CSSOM rather than a style attribute, which the display's CSP doesn't allow.
    b.style.backgroundColor = hex;
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      onPick(parseInt(hex.slice(1), 16));
    });
    row.append(b);
  }
  return row;
}

function scenePicker(scenes: string[], onPick: (name: string) => void): HTMLElement {
  const select = h("select", { class: "ha-scene", "aria-label": "Scene" }, h("option", { value: "" }, "Scene…"));
  for (const name of scenes) select.append(h("option", { value: name }, name));
  select.addEventListener("click", (ev) => ev.stopPropagation());
  select.addEventListener("change", () => {
    if (select.value) onPick(select.value);
    select.value = "";
  });
  return select;
}

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

  const act = async (action: string, value?: number, option?: string) => {
    const ok = await send("ha", { entity: w.entityId, action, value, option });
    const provider = w.provider ?? "homeAssistant";
    say(ok ? "" : provider === "homeAssistant" ? "Couldn't reach Home Assistant" : "Couldn't reach the device");
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
    const key = `${e.state}|${e.brightness}|${e.current}|${e.target}|${pendingTarget}|${message}|${e.name}|${e.color}|${e.scenes?.length}`;
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
      const parts: (HTMLElement | null)[] = [switchBtn, note];
      if (kind === "light" && e.state === "on" && e.brightness !== undefined) {
        const pct = Math.max(1, Math.round((e.brightness / 255) * 100));
        const range = h("input", { type: "range", class: "ha-range", min: 1, max: 100, value: pct, "aria-label": "Brightness" });
        range.addEventListener("click", (ev) => ev.stopPropagation());
        range.addEventListener("change", () => void act("brightness", Number(range.value)));
        parts.push(range);
      }
      // Colour lights (Govee, Hue, LIFX): a row of colours and the light's scenes, only while it is on.
      if (kind === "light" && e.state === "on" && e.color !== undefined) parts.push(swatches(e.color, (rgb) => void act("color", rgb)));
      if (kind === "light" && e.state === "on" && e.scenes?.length)
        parts.push(scenePicker(e.scenes, (name) => void act("scene", undefined, name)));
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

    if (kind === "lock") {
      // Lock only (Melvin's wall screen is in a shared room): an unlocked door can be locked, never the reverse.
      if (e.state === "locked" || dead(e)) return fill(root, name, h("div", { class: "ha-value" }, stateText(e)), note);
      const lockBtn = h(
        "button",
        {
          type: "button",
          class: "ha-btn ha-lock",
          "aria-label": "Hold to lock",
          draggable: "false",
        },
        "Hold to lock",
      );
      let lockHeldAt: number | null = null;
      const stopLockHold = () => {
        lockHeldAt = null;
        lockBtn.classList.remove("holding");
      };
      lockBtn.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        stopLockHold();
        lockHeldAt = performance.now();
        lockBtn.classList.add("holding");
        try {
          lockBtn.setPointerCapture(ev.pointerId);
        } catch {
          // Pointer capture is optional; leaving or cancelling still cancels the hold.
        }
      });
      lockBtn.addEventListener("pointerup", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (completesLockHold(lockHeldAt)) {
          stopLockHold();
          void act("lock");
        } else {
          stopLockHold();
        }
      });
      lockBtn.addEventListener("pointerleave", stopLockHold);
      lockBtn.addEventListener("pointercancel", stopLockHold);
      lockBtn.addEventListener("contextmenu", (ev) => ev.preventDefault());
      lockBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        // Pointer holds already send lock from the timer; keyboard activation has no pointer detail.
        if (ev.detail === 0) void act("lock");
      });
      return fill(root, name, h("div", { class: "ha-value" }, stateText(e)), lockBtn, note);
    }

    return fill(
      root,
      name,
      btn(w.title || e.name, () => void act("press").then(() => !message && say("Done")), "ha-btn ha-big", dead(e)),
      note,
    );
  };

  const stop = subscribe<HaData>("ha", HA_EVERY, (d) => {
    if (!d.configured) return fill(root, h("div", { class: "w-empty" }, "Set up Home Assistant under Settings."));
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
