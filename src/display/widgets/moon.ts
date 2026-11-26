import { fullMoonName, moonPath, moonPhase } from "@/lib/moon";

import { fill, h } from "../dom";
import { fmt } from "../format";
import type { Mount } from "./types";

// Moon phase (Melvin, 2026-11-25): worked out on the device, no feed. Loads on its own (src/display/widgets/lazy.ts)
// and redraws every half hour, which is finer than the phase visibly changes.

const SVG = "http://www.w3.org/2000/svg";
const R = 50;

/** The disc as seen from the northern hemisphere, lit on the right while waxing (displays never get coordinates). */
export function moonDisc(phase: number): SVGSVGElement {
  const el = document.createElementNS(SVG, "svg");
  el.setAttribute("viewBox", `0 0 ${2 * R} ${2 * R}`);
  el.setAttribute("class", "mn-disc");
  el.setAttribute("aria-hidden", "true");
  const dark = document.createElementNS(SVG, "circle");
  dark.setAttribute("cx", String(R));
  dark.setAttribute("cy", String(R));
  dark.setAttribute("r", String(R - 0.5));
  dark.setAttribute("class", "mn-dark");
  const lit = document.createElementNS(SVG, "path");
  lit.setAttribute("d", moonPath(phase, R));
  lit.setAttribute("class", "mn-lit");
  el.append(dark, lit);
  return el;
}

export const moon: Mount<"moon"> = (el, w, ctx) => {
  const root = h("div", { class: "w-moon" });
  el.append(root);
  const day = (ms: number) => fmt(ctx.timeZone, { weekday: "short", month: "short", day: "numeric" }).format(ms);
  const month = (ms: number) => Number(fmt(ctx.timeZone, { month: "numeric" }).format(ms)) - 1;
  const draw = () => {
    const now = Date.now();
    const m = moonPhase(now);
    const isFull = m.name === "Full moon";
    const name = isFull && w.showName ? fullMoonName(m.phase < 0.5 ? m.nextFull : now, month) : "";
    fill(
      root,
      w.title ? h("div", { class: "w-label" }, w.title) : null,
      h(
        "div",
        { class: "mn-body" },
        moonDisc(m.phase),
        h(
          "div",
          { class: "mn-text" },
          h("div", { class: "mn-name" }, m.name),
          name ? h("div", { class: "mn-full-name" }, name) : null,
          h("div", { class: "mn-lit-pct" }, `${Math.round(m.illumination * 100)}% lit`),
          w.showNext
            ? h(
                "div",
                { class: "mn-next" },
                isFull ? null : h("span", {}, `Full ${day(m.nextFull)}${w.showName ? ` · ${fullMoonName(m.nextFull, month)}` : ""}`),
                h("span", {}, `New ${day(m.nextNew)}`),
              )
            : null,
        ),
      ),
    );
  };
  draw();
  const timer = setInterval(draw, 30 * 60_000);
  return () => clearInterval(timer);
};
