import type { WidgetType } from "@/lib/config/schema";
import { WIDGETS } from "@/lib/config/widgets";

import { h } from "../dom";

// Widgets whose data arrives in a later phase show what they will be, so a layout can be built now.
export function placeholder(el: HTMLElement, type: WidgetType): () => void {
  const info = WIDGETS[type];
  el.append(
    h(
      "div",
      { class: "w-placeholder" },
      h("div", { class: "ph-icon", "aria-hidden": "true" }, info.icon),
      h("div", { class: "w-label" }, info.label),
      h("div", { class: "w-sub" }, "Coming soon"),
    ),
  );
  return () => undefined;
}
