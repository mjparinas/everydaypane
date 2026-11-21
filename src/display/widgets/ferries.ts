import type { FerriesData, FerrySailing } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import { fmt, shortTime } from "../format";
import { everyMinute } from "../ticker";
import type { Mount } from "./types";

// BC Ferries (Melvin, 2026-11-21): for each picked route, the next sailings with a bar for how full each one is
// (amber from 70 %, red from 90 %), and cancellations and delays called out. Sailings whose time has passed are
// dropped on the wall's own clock between polls; conditions older than 15 minutes are labelled with their time.

const OLD_MS = 15 * 60_000;
const minutes = (hhmm: string) => {
  const [hh = 0, mm = 0] = hhmm.split(":").map(Number);
  return hh * 60 + mm;
};

/** True once a sailing is more than five minutes past its time (a sailing after midnight is tomorrow's, not past). */
export function hasLeft(s: Pick<FerrySailing, "time" | "delayMinutes">, nowHHMM: string): boolean {
  const late = (minutes(nowHHMM) - minutes(s.time) - (s.delayMinutes ?? 0) + 1440) % 1440;
  return late > 5 && late < 12 * 60;
}

export function fullness(percent: number): { text: string; level: 1 | 2 | 3 } {
  if (percent >= 100) return { text: "Full", level: 3 };
  return { text: `${percent}% full`, level: percent >= 90 ? 3 : percent >= 70 ? 2 : 1 };
}

function sailingRow(s: FerrySailing, hour12: boolean, showVessel: boolean) {
  const time = h("span", { class: "fe-time" }, shortTime(`T${s.time}`, hour12));
  let detail: HTMLElement;
  if (s.state === "cancelled") detail = h("span", { class: "fe-note fe-bad" }, "Cancelled");
  else if (s.fill !== undefined) {
    const f = fullness(s.fill);
    const bar = h("span", { class: "fe-bar" }, h("span", { class: "fe-bar-in" }));
    (bar.firstChild as HTMLElement).style.transform = `scaleX(${s.fill / 100})`;
    detail = h("span", { class: `fe-fill fe-${f.level}` }, bar, h("span", { class: "fe-pct" }, f.text));
  } else detail = h("span", { class: "fe-note" }, "");
  const sub = [
    s.state === "delayed" ? (s.delayMinutes ? `Delayed ${s.delayMinutes} min` : "Delayed") : "",
    showVessel ? s.vessel : "",
    s.state !== "cancelled" && s.note && s.note.toLowerCase() !== "cancelled" ? s.note : "",
  ].filter(Boolean);
  return h("li", { class: `fe-row fe-${s.state}` }, time, detail, sub.length ? h("span", { class: "fe-sub" }, sub.join(" · ")) : null);
}

export const ferries: Mount<"ferries"> = (el, w, ctx) => {
  const root = h("div", { class: "w-ferries" }, h("div", { class: "w-empty" }, "Checking sailings…"));
  el.append(root);
  let data: FerriesData | null = null;

  const draw = (now: Date) => {
    if (!data) return;
    if (data.down) return fill(root, h("div", { class: "w-empty" }, "BC Ferries sailings are unavailable right now."));
    const nowHHMM = fmt(ctx.timeZone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
    const routes = w.routes.flatMap((code) => data?.routes.find((r) => r.code === code) ?? []);
    if (routes.length === 0) return fill(root, h("div", { class: "w-empty" }, "No sailings to show."));
    const old = now.getTime() - data.at > OLD_MS;
    fill(
      root,
      w.title ? h("div", { class: "w-label" }, w.title) : null,
      ...routes.map((r) => {
        const next = r.sailings.filter((s) => !hasLeft(s, nowHHMM)).slice(0, w.count);
        return h(
          "section",
          { class: "fe-route" },
          h("div", { class: "fe-name" }, h("span", {}, r.name), r.duration ? h("span", { class: "fe-dur" }, r.duration) : null),
          next.length
            ? h("ul", { class: "fe-list" }, ...next.map((s) => sailingRow(s, ctx.hour12, w.showVessel)))
            : h("div", { class: "fe-none" }, r.status === "no-service" ? "No service today" : "No more sailings today"),
        );
      }),
      old && data.at
        ? h(
            "div",
            { class: "fe-asof" },
            `As of ${shortTime(`T${fmt(ctx.timeZone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(data.at))}`, ctx.hour12)}`,
          )
        : null,
    );
  };

  const stopFeed = subscribe<FerriesData>("ferries", 2 * 60_000, (d) => {
    data = d;
    draw(new Date());
  });
  const stopTick = everyMinute(draw);
  return () => {
    stopFeed();
    stopTick();
  };
};
