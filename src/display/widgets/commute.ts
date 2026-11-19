import type { CommuteData, CommuteRoute } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import { fmt, shortTime } from "../format";
import { everyMinute } from "../ticker";
import type { Mount } from "./types";

// Commute time (Melvin, 2026-11-19): each place's drive time with live traffic, coloured by how much traffic adds, and
// when you'd arrive if you left now. A place with a "be there by" time says when to leave instead, in the three hours
// before it. Traffic older than 20 minutes isn't shown as if it were live.

const OLD_MS = 20 * 60_000;

export function duration(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60));
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}

/** 1: about as quick as empty roads; 2: slow; 3: heavy. */
export function trafficLevel(r: Pick<CommuteRoute, "seconds" | "freeFlowSeconds" | "delaySeconds">): 1 | 2 | 3 {
  const delay = r.delaySeconds ?? 0;
  const ratio = r.seconds && r.freeFlowSeconds ? r.seconds / r.freeFlowSeconds : 1;
  if (delay < 180 || ratio < 1.15) return 1;
  return ratio < 1.4 ? 2 : 3;
}

const minutesOfDay = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const hhmm = (minutes: number) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/**
 * What the second line says about timing: "Leave by 8:05 AM" (or "Leave now") in the three hours before a "be there
 * by" time, otherwise "Arrive 8:42 AM" when arrivals are shown, otherwise nothing.
 */
export function timing(r: CommuteRoute, nowHHMM: string, hour12: boolean, showArrival: boolean): string {
  if (r.seconds === undefined) return "";
  const now = minutesOfDay(nowHHMM);
  const drive = Math.ceil(r.seconds / 60);
  if (r.arriveBy) {
    const target = minutesOfDay(r.arriveBy);
    if (target > now && target - now <= 180) {
      const leave = target - drive;
      return leave <= now ? "Leave now" : `Leave by ${shortTime(`T${hhmm(leave)}`, hour12)}`;
    }
  }
  return showArrival ? `Arrive ${shortTime(`T${hhmm(now + drive)}`, hour12)}` : "";
}

export function distance(meters: number, units: "metric" | "imperial"): string {
  const v = units === "imperial" ? meters / 1609.344 : meters / 1000;
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units === "imperial" ? "mi" : "km"}`;
}

export const commute: Mount<"commute"> = (el, w, ctx) => {
  const root = h("div", { class: "w-commute" }, h("div", { class: "w-empty" }, "Checking traffic…"));
  el.append(root);
  let data: CommuteData | null = null;

  const draw = (now: Date) => {
    if (!data) return;
    if (data.missing === "key") return fill(root, h("div", { class: "w-empty" }, "Add a TomTom key to show commute times."));
    const routes = data.routes.filter((r) => w.destinationIds.length === 0 || w.destinationIds.includes(r.id));
    if (data.missing === "places" || routes.length === 0)
      return fill(root, h("div", { class: "w-empty" }, "Add home and places under Settings › Commute."));
    const nowHHMM = fmt(ctx.timeZone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
    fill(
      root,
      w.title ? h("div", { class: "w-label" }, w.title) : null,
      h(
        "ul",
        { class: "cm-list" },
        ...routes.map((r) => {
          const live = r.seconds !== undefined && r.at !== undefined && now.getTime() - r.at < OLD_MS;
          const level = live ? trafficLevel(r) : 0;
          const delay = live && level > 1 ? `+${duration(r.delaySeconds ?? 0)} traffic` : "";
          const sub = live
            ? [
                delay,
                timing(r, nowHHMM, ctx.hour12, w.showArrival),
                w.showDistance && r.meters ? distance(r.meters, ctx.payload.units) : "",
              ].filter(Boolean)
            : ["No traffic info right now"];
          return h(
            "li",
            { class: `cm-row cm-${level}` },
            h("div", { class: "cm-name" }, r.emoji ? `${r.emoji} ${r.name}` : r.name),
            h("div", { class: "cm-time" }, live ? duration(r.seconds ?? 0) : "–"),
            h("div", { class: "cm-sub" }, sub.join(" · ")),
          );
        }),
      ),
    );
  };

  const stopFeed = subscribe<CommuteData>("commute", 5 * 60_000, (d) => {
    data = d;
    draw(new Date());
  });
  const stopTick = everyMinute(draw);
  return () => {
    stopFeed();
    stopTick();
  };
};
