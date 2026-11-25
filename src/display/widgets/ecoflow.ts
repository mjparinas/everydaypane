import type { EcoFlowData, EcoFlowDevice } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import type { Mount } from "./types";

// EcoFlow power stations (Melvin, 2026-11-21): one row per device with its battery bar (amber under 30 %, red under
// 15 %), power in and out, solar, AC and DC flows, and how long to full or to empty. Polled every minute; EcoFlow's
// readings are cached a minute on the server.

const EVERY = 60_000;

export function watts(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)} kW` : `${n} W`;
}

export function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours >= 24) return `${Math.floor(hours / 24)} d ${hours % 24} h`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function batteryLevel(soc: number): 1 | 2 | 3 {
  return soc < 15 ? 3 : soc < 30 ? 2 : 1;
}

function deviceRow(d: EcoFlowDevice, w: { showSolar: boolean; showFlows: boolean; showTime: boolean }) {
  const head = h(
    "div",
    { class: "ef-head" },
    h("span", { class: "ef-name" }, d.name),
    d.soc !== undefined ? h("span", { class: "ef-soc" }, `${d.soc}%`) : null,
  );
  let bar: HTMLElement | null = null;
  if (d.soc !== undefined) {
    const inner = h("span", { class: "ef-bar-in" });
    inner.style.transform = `scaleX(${d.soc / 100})`;
    bar = h("div", { class: `ef-bar ef-${batteryLevel(d.soc)}${d.charging ? " ef-charging" : ""}` }, inner);
  }
  if (!d.online && d.soc === undefined) return h("li", { class: "ef-row ef-off" }, head, h("div", { class: "ef-sub" }, "Offline"));
  const main = [
    d.inW !== undefined ? `In ${watts(d.inW)}` : "",
    d.outW !== undefined ? `Out ${watts(d.outW)}` : "",
    w.showTime && d.minutes !== undefined ? (d.charging ? `Full in ${duration(d.minutes)}` : `${duration(d.minutes)} left`) : "",
  ].filter(Boolean);
  const flows = [
    w.showSolar && d.solarW ? `☀ Solar ${watts(d.solarW)}` : "",
    w.showFlows && d.acInW ? `AC in ${watts(d.acInW)}` : "",
    w.showFlows && d.acOutW ? `AC out ${watts(d.acOutW)}` : "",
    w.showFlows && d.dcOutW ? `DC out ${watts(d.dcOutW)}` : "",
  ].filter(Boolean);
  return h(
    "li",
    { class: `ef-row${d.online ? "" : " ef-off"}` },
    head,
    bar,
    main.length ? h("div", { class: "ef-main" }, main.join(" · ")) : null,
    flows.length ? h("div", { class: "ef-sub" }, flows.join(" · ")) : null,
    !d.online ? h("div", { class: "ef-sub" }, "Offline, last reading") : null,
  );
}

export const ecoflow: Mount<"ecoflow"> = (el, w) => {
  const root = h("div", { class: "w-ecoflow" }, h("div", { class: "w-empty" }, "Reading batteries…"));
  el.append(root);
  return subscribe<EcoFlowData>("ecoflow", EVERY, (d) => {
    const label = h("div", { class: "w-label" }, w.title || "Power");
    if (!d.configured) return fill(root, label, h("div", { class: "w-empty" }, "Add your EcoFlow keys in Settings › EcoFlow."));
    const devices = w.devices.length ? w.devices.flatMap((sn) => d.devices.find((x) => x.sn === sn) ?? []) : d.devices;
    if (devices.length === 0) return fill(root, label, h("div", { class: "w-empty" }, d.error || "No EcoFlow devices to show."));
    fill(root, label, h("ul", { class: "ef-list" }, ...devices.map((x) => deviceRow(x, w))));
  });
};
