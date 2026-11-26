import { waitLevel } from "@/lib/border";
import type { BorderData, BorderWait } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import { fmt } from "../format";
import type { Mount } from "./types";

// Border wait times (Melvin, 2026-11-25): one row per crossing with the car wait into the U.S. and into Canada,
// green to 15 minutes, amber to 45, red beyond; the shortest known wait in each direction is marked. Both agencies
// update about hourly, so a reading older than two hours is greyed out rather than shown as current.
const EVERY = 5 * 60_000;
const OLD = 2 * 3_600_000;

export function waitText(x: BorderWait | null): string {
  if (!x) return "—";
  if (x.closed) return "Closed";
  if (x.minutes === null) return "—";
  if (x.minutes === 0) return "No wait";
  return x.minutes >= 60 ? `${Math.floor(x.minutes / 60)} h ${x.minutes % 60 ? `${x.minutes % 60} min` : ""}`.trim() : `${x.minutes} min`;
}

/** The index of the one shortest known wait, or -1 when fewer than two are known or there is a tie. */
export function fastest(waits: (BorderWait | null)[]): number {
  const known = waits.map((x, i) => [x && !x.closed && x.minutes !== null ? x.minutes : Infinity, i] as const);
  if (known.filter(([m]) => m !== Infinity).length < 2) return -1;
  const best = Math.min(...known.map(([m]) => m));
  const at = known.filter(([m]) => m === best);
  return at.length === 1 ? at[0]![1] : -1;
}

export const borderWait: Mount<"borderWait"> = (el, w, ctx) => {
  const root = h("div", { class: "w-border" }, h("div", { class: "w-empty" }, "Loading border waits…"));
  el.append(root);
  const at = fmt(ctx.timeZone, { hour: "numeric", minute: "2-digit", hour12: ctx.hour12 });
  const us = w.directions !== "toCanada";
  const ca = w.directions !== "toUS";
  return subscribe<BorderData>("border", EVERY, (d) => {
    const label = w.title ? h("div", { class: "w-label" }, w.title) : null;
    const rows = w.crossings.map((id) => d.crossings.find((c) => c.id === id)).filter((c) => c !== undefined);
    if (!rows.length) return fill(root, label, h("div", { class: "w-empty" }, "Border waits unavailable"));
    const now = Date.now();
    const bestUS = fastest(rows.map((r) => r.toUS));
    const bestCA = fastest(rows.map((r) => r.toCanada));
    const cell = (x: BorderWait | null, best: boolean) => {
      const old = !x || (x.at > 0 && now - x.at > OLD);
      const level = x && !x.closed && x.minutes !== null && !old ? ` bw-${waitLevel(x.minutes)}` : "";
      return h(
        "div",
        { class: `bw-wait${level}${old ? " bw-old" : ""}${best && !old ? " bw-best" : ""}` },
        h("span", { class: "bw-min" }, waitText(x)),
        w.showNexus && x?.nexus !== undefined ? h("small", { class: "bw-nexus" }, `NEXUS ${waitText({ ...x, minutes: x.nexus })}`) : null,
      );
    };
    const head = h(
      "div",
      { class: "bw-row bw-head" },
      h("span", {}, ""),
      us ? h("span", {}, "To U.S.") : null,
      ca ? h("span", {}, "To Canada") : null,
    );
    const list = rows.map((r, i) =>
      h(
        "div",
        { class: "bw-row" },
        h("span", { class: "bw-name" }, r.name),
        us ? cell(r.toUS, i === bestUS) : null,
        ca ? cell(r.toCanada, i === bestCA) : null,
      ),
    );
    const times = rows.flatMap((r) => [us ? r.toUS?.at : 0, ca ? r.toCanada?.at : 0]).filter((t): t is number => !!t);
    const down = [us && d.down.cbp ? "CBP" : "", ca && d.down.cbsa ? "CBSA" : ""].filter(Boolean).join(" and ");
    const foot = down
      ? `${down} didn't answer`
      : times.length
        ? `Updated ${at.format(Math.max(...times))} · CBSA, U.S. CBP`
        : "CBSA, U.S. CBP";
    fill(root, label, h("div", { class: `bw-grid${us && ca ? "" : " bw-one"}` }, head, ...list), h("div", { class: "bw-foot" }, foot));
  });
};
