import { h, keepFitted, shrinkToFit } from "../dom";
import type { Mount } from "./types";

export const note: Mount<"note"> = (el, w) => {
  const text = h("div", { class: "note-text" }, w.text);
  const root = h("div", { class: `w-note note-${w.size}` }, w.title ? h("div", { class: "w-label" }, w.title) : null, text);
  el.append(root);
  // Long notes shrink to fit the tile instead of spilling past its top and bottom (design review, 2026-11-26).
  return keepFitted(el, () => shrinkToFit(root, text));
};
