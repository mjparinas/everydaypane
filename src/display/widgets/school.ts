import type { SchoolData } from "@/lib/display/types";
import { schoolForWidget } from "@/lib/school";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import type { Mount } from "./types";

// School status (Melvin, 2026-11-22): open, closed, delayed or late start from the district page. The feed is the
// whole district; this widget drops a notice that isn't about the schools it watches.

export const school: Mount<"school"> = (el, w) => {
  const root = h("div", { class: "w-school" }, h("div", { class: "w-empty" }, "Checking schools…"));
  el.append(root);
  return subscribe<SchoolData>("school", 5 * 60_000, (d) => {
    const status = schoolForWidget(d, w.schools);
    fill(
      root,
      h("div", { class: "w-label" }, w.title || status.districtName || "Schools"),
      h("div", { class: `sc-state sc-${status.state}` }, status.summary),
      status.detail && status.state !== "open" ? h("div", { class: "sc-detail" }, status.detail) : null,
    );
  });
};
