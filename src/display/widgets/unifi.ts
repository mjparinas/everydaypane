import type { UnifiData, UnifiSite } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import { fmt } from "../format";
import type { Mount } from "./types";

// UniFi network health (Melvin, 2026-11-21): is the internet up, how quick is it, and how much was it down today,
// as the home's UniFi gateway reports it to UniFi's cloud (src/server/unifi.ts). The internet ping widget measures
// from this screen; this one is the router's own view of the line, so they sit happily side by side.

const EVERY = 60_000;
const SVG = "http://www.w3.org/2000/svg";

export type Health = "ok" | "slow" | "down";

/** "down" from the server; "slow" when the latest latency or packet loss is over the widget's line. */
export function health(site: Pick<UnifiSite, "status" | "latency" | "packetLoss">, slowMs: number): Health {
  if (site.status === "down") return "down";
  if ((site.latency ?? 0) >= slowMs || (site.packetLoss ?? 0) >= 2) return "slow";
  return "ok";
}

const LABEL: Record<Health, string> = { ok: "Online", slow: "Slow", down: "Down" };

export function downtime(minutes: number): string {
  if (minutes < 1) return "No outages in 24 h";
  if (minutes < 60) return `Down ${minutes} min in 24 h`;
  const hrs = Math.floor(minutes / 60);
  return `Down ${hrs} h${minutes % 60 ? ` ${minutes % 60} min` : ""} in 24 h`;
}

/** A polyline's points for the latency sparkline in a 100 × 24 box; gaps (no reading) break the line. */
export function sparkPaths(values: (number | null)[]): string[] {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return [];
  const max = Math.max(...nums, 1);
  const step = values.length > 1 ? 100 / (values.length - 1) : 0;
  const lines: string[] = [];
  let current: string[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (current.length > 1) lines.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${Math.round(i * step * 10) / 10},${Math.round((22 - (v / max) * 20) * 10) / 10}`);
  });
  if (current.length > 1) lines.push(current.join(" "));
  return lines;
}

function spark(values: (number | null)[]): SVGSVGElement | null {
  const paths = sparkPaths(values);
  if (!paths.length) return null;
  const el = document.createElementNS(SVG, "svg");
  el.setAttribute("viewBox", "0 0 100 24");
  el.setAttribute("preserveAspectRatio", "none");
  el.setAttribute("class", "un-spark");
  el.setAttribute("aria-hidden", "true");
  for (const points of paths) {
    const line = document.createElementNS(SVG, "polyline");
    line.setAttribute("points", points);
    line.setAttribute("vector-effect", "non-scaling-stroke");
    el.append(line);
  }
  return el;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const unifi: Mount<"unifi"> = (el, w, ctx) => {
  const root = h("div", { class: "w-unifi" }, h("div", { class: "w-empty" }, "Loading network…"));
  el.append(root);
  const label = () => h("div", { class: "w-label" }, w.title || "Internet");
  return subscribe<UnifiData>("unifi", EVERY, (d) => {
    if (!d.configured) return fill(root, label(), h("div", { class: "w-empty" }, "Add a UniFi API key in Household Settings."));
    const site = (w.siteId && d.sites.find((s) => s.id === w.siteId)) || d.sites[0];
    if (!site) return fill(root, label(), h("div", { class: "w-empty" }, d.error ?? "No UniFi sites on this key."));
    const state = health(site, w.slowMs);
    const time = fmt(ctx.timeZone, { hour: "numeric", minute: "2-digit", hour12: ctx.hour12 });
    const counts: string[] = [];
    if (site.clients !== undefined) counts.push(plural(site.clients, "client", "clients"));
    if (site.devices !== undefined)
      counts.push(`${plural(site.devices, "device", "devices")}${site.offlineDevices ? ` (${site.offlineDevices} offline)` : ""}`);
    const quality =
      site.latency !== undefined
        ? `${site.latency} ms${site.packetLoss ? ` · ${site.packetLoss}% loss` : ""}`
        : state === "down"
          ? ""
          : "No recent reading";
    fill(
      root,
      label(),
      h(
        "div",
        { class: `un-status un-${state}` },
        h("span", { class: "un-dot" }),
        h("span", { class: "un-word" }, LABEL[state]),
        quality ? h("span", { class: "un-ms" }, quality) : null,
      ),
      h(
        "div",
        { class: "un-row" },
        downtime(site.downMinutes24h),
        site.downMinutes24h >= 1 && site.lastOutageAt ? ` · last ${time.format(new Date(site.lastOutageAt))}` : "",
      ),
      w.showChart ? spark(site.spark) : null,
      w.showUsage && site.download !== undefined
        ? h("div", { class: "un-row" }, `Using ↓ ${site.download} ↑ ${site.upload ?? 0} Mbps`)
        : null,
      w.showCounts && counts.length ? h("div", { class: "un-row" }, counts.join(" · ")) : null,
      h(
        "div",
        { class: "un-foot" },
        [site.isp, d.sites.length > 1 ? site.name : "", d.stale ? "Last Good Reading" : ""].filter(Boolean).join(" · "),
      ),
    );
  });
};
