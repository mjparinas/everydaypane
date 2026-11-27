import type { BriefData } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import type { Mount } from "./types";

// Morning brief (Melvin, 2026-11-26). Loads on its own (src/display/widgets/lazy.ts). The server has already read the
// feeds and written the phrases, so this only paints them and shrinks the text until it fits the tile.

export const brief: Mount<"brief"> = (el, w) => {
  const root = h("div", { class: "w-brief" }, h("div", { class: "w-empty" }, "Loading…"));
  el.append(root);
  let body: HTMLElement | null = null;

  // Step the text down until nothing overflows; the widget's own font size setting still scales every step. A busy
  // day that still doesn't fit at half size scrolls by touch rather than hiding its last lines (Melvin, 2026-11-27:
  // every event is named now, not "3 more on the calendar").
  const fit = () => {
    if (!body) return;
    let scale = 1;
    body.style.setProperty("--fit", "1");
    while (scale > 0.5 && body.scrollHeight > body.clientHeight + 1) {
      scale -= 0.07;
      body.style.setProperty("--fit", scale.toFixed(2));
    }
    body.classList.toggle("bf-scroll", body.scrollHeight > body.clientHeight + 1);
  };

  const stop = subscribe<BriefData>(`brief?w=${encodeURIComponent(w.id)}`, 5 * 60_000, (d) => {
    const label = w.title || (d.day === "tomorrow" ? "Tomorrow" : d.greeting);
    body =
      w.layout === "list" && d.items.length
        ? h(
            "ul",
            { class: "bf-body bf-list" },
            ...d.items.map((i) =>
              h(
                "li",
                { class: `bf-item${i.tone ? ` bf-${i.tone}` : ""}` },
                h("span", { class: "bf-icon", "aria-hidden": "true" }, i.icon),
                h("span", { class: "bf-text" }, i.text, i.detail ? h("span", { class: "bf-detail" }, i.detail) : null),
              ),
            ),
          )
        : h("p", { class: "bf-body bf-sentence" }, d.summary);
    fill(root, h("div", { class: "w-label" }, label), body);
    fit();
  });
  const resize = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
  resize?.observe(root);
  return () => {
    stop();
    resize?.disconnect();
  };
};
