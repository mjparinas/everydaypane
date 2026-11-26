import { AURORA_CHANCE_LABELS } from "@/lib/aurora";
import type { AuroraData } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import { fmt } from "../format";
import type { Mount } from "./types";

// Aurora tonight (Melvin, 2026-11-25). Loads on its own (src/display/widgets/lazy.ts); the server has already worked
// out the chance from home's latitude, so this only paints it, plus a bar per three-hour block for the next day.

const kp = (n: number) => (Math.round(n * 3) / 3).toFixed(n % 1 ? 1 : 0);

export const aurora: Mount<"aurora"> = (el, w, ctx) => {
  const root = h("div", { class: "w-aurora" }, h("div", { class: "w-empty" }, "Loading…"));
  el.append(root);
  const hour = (iso: string) =>
    fmt(ctx.timeZone, { hour: "numeric", hour12: ctx.hour12 })
      .format(Date.parse(iso))
      .replace(/\s?([ap])\.?m\.?/i, (_, p: string) => p.toLowerCase());
  return subscribe<AuroraData>("aurora", 30 * 60_000, (d) => {
    if (d.error && !d.blocks.length) return fill(root, h("div", { class: "w-empty" }, d.error));
    const peak = d.tonightKp;
    const bars =
      w.showBlocks && d.blocks.length
        ? h(
            "div",
            { class: "au-bars" },
            ...d.blocks.map((b) =>
              h(
                "div",
                { class: `au-bar${b.kp >= d.kpForHorizon ? " au-hit" : ""}${b.predicted ? "" : " au-seen"}` },
                h("span", { class: "au-fill", style: `transform:scaleY(${Math.max(0.04, Math.min(9, b.kp) / 9)})` }),
                h("span", { class: "au-hour" }, hour(b.start)),
              ),
            ),
          )
        : null;
    fill(
      root,
      h("div", { class: "w-label" }, w.title || "Aurora Tonight"),
      h(
        "div",
        { class: `au-head au-${d.chance}` },
        h("span", { class: "au-kp" }, peak === undefined ? "–" : `Kp ${kp(peak)}`),
        d.storm ? h("span", { class: "au-storm" }, `G${d.storm} storm`) : null,
      ),
      h("div", { class: "au-chance" }, AURORA_CHANCE_LABELS[d.chance]),
      h(
        "div",
        { class: "au-note" },
        [d.kpNow !== undefined ? `Now Kp ${kp(d.kpNow)}` : "", d.kpForHorizon ? `Kp ${kp(d.kpForHorizon)}+ to see it from here` : ""]
          .filter(Boolean)
          .join(" · "),
      ),
      bars,
    );
  });
};
