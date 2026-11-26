import type { WidgetOf } from "@/lib/config/schema";
import type { TransitData, TransitDeparture } from "@/lib/display/types";
import { agencyOf, stopKey } from "@/lib/transitAgencies";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import { fmt } from "../format";
import { everyMinute } from "../ticker";
import type { Mount } from "./types";

// TransLink departures (Melvin, 2026-11-19): for each picked stop, the next buses with minutes to go and whether they
// are running late, from the server's 30-second read of TransLink's live feed. Times are absolute, so the minutes
// count down between reads without asking again. Since the regional packs (2026-11-26) the widget can read any agency in
// src/lib/transitAgencies.ts; only its name and credit line reach this bundle.

export const TRANSIT_EVERY = 30_000;

/** The departures a widget shows for one stop: its routes only, none it's too late to walk to, cut to `count`. */
export function shownDepartures(list: TransitDeparture[], w: Pick<WidgetOf<"transit">, "routes" | "count" | "walkMinutes">, nowS: number) {
  const routes = new Set(w.routes.map((r) => r.toUpperCase()));
  return list
    .filter((d) => routes.size === 0 || routes.has(d.route.toUpperCase()))
    .filter((d) => d.time - nowS >= w.walkMinutes * 60 - 30)
    .slice(0, w.count);
}

/** "Now", "4 min", or past an hour the clock time. */
export function minutesLabel(time: number, nowS: number, clock: string): string {
  const m = Math.floor((time - nowS) / 60);
  if (m < 1) return "Now";
  return m < 60 ? `${m} min` : clock;
}

/** "3 min late", "2 min early", "On time" for a live prediction, "Scheduled" for one with no bus on it yet. */
export function delayLabel(d: TransitDeparture): { text: string; cls: string } {
  const m = d.delay === null ? 0 : Math.round(d.delay / 60);
  if (m >= 1) return { text: `${m} min late`, cls: "tl-late" };
  if (m <= -1) return { text: `${-m} min early`, cls: "tl-early" };
  return d.live ? { text: "On time", cls: "tl-ontime" } : { text: "Scheduled", cls: "" };
}

export const transit: Mount<"transit"> = (el, w, ctx) => {
  const agency = agencyOf(w.agency);
  const root = h("div", { class: "w-transit" }, h("div", { class: "w-empty" }, `Checking ${agency.name}…`));
  el.append(root);
  let data: TransitData | null = null;
  const clock = fmt(ctx.timeZone, { hour: "numeric", minute: "2-digit", hour12: ctx.hour12 });

  const draw = () => {
    if (!data) return;
    if (agency.needsKey && !data.configured)
      return fill(root, h("div", { class: "w-empty" }, "Add a TransLink API key in Vercel to show departures."));
    if (w.stops.length === 0) return fill(root, h("div", { class: "w-empty" }, "Pick your stops in this widget's settings."));
    const nowS = Math.floor(Date.now() / 1000);
    fill(
      root,
      h("div", { class: "w-label" }, w.title || "Next buses"),
      ...w.stops.map((stop) => {
        const list = shownDepartures(data?.stops[stopKey(w.agency, stop.id)] ?? [], w, nowS);
        return h(
          "section",
          { class: "tl-stop" },
          h("div", { class: "tl-name" }, stop.name, stop.code ? h("span", { class: "tl-code" }, ` #${stop.code}`) : null),
          list.length
            ? h(
                "ul",
                { class: "tl-list" },
                ...list.map((d) => {
                  const at = clock.format(d.time * 1000);
                  const delay = delayLabel(d);
                  return h(
                    "li",
                    { class: "tl-row" },
                    h("span", { class: "tl-route" }, d.route),
                    h(
                      "span",
                      { class: "tl-where" },
                      h("span", { class: "tl-sign" }, d.headsign || "—"),
                      h("span", { class: `tl-delay ${delay.cls}` }, `${at} · ${delay.text}`),
                    ),
                    h("span", { class: "tl-mins" }, minutesLabel(d.time, nowS, at)),
                  );
                }),
              )
            : h("div", { class: "tl-none" }, "No departures in the next two hours"),
        );
      }),
      h("div", { class: "tl-src" }, data.failed?.includes(w.agency) ? `${agency.name} isn't answering right now` : agency.credit),
    );
  };

  const stopFeed = subscribe<TransitData>("transit", TRANSIT_EVERY, (d) => {
    data = d;
    draw();
  });
  const stopTick = everyMinute(draw);
  return () => {
    stopFeed();
    stopTick();
  };
};
