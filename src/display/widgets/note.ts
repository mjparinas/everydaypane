import { h } from "../dom";
import type { Mount } from "./types";

export const note: Mount<"note"> = (el, w) => {
  el.append(
    h(
      "div",
      { class: `w-note note-${w.size}` },
      w.title ? h("div", { class: "w-label" }, w.title) : null,
      h("div", { class: "note-text" }, w.text),
    ),
  );
  return () => undefined;
};
