import type { AlertData } from "@/lib/display/types";

import { alertsList } from "../alerts";
import { subscribe } from "../api";
import { h } from "../dom";
import type { Mount } from "./types";

// Every current alert for the area, most serious first (the strip across the top shows only the serious ones).
export const alerts: Mount<"alerts"> = (el, w, ctx) => {
  const root = h("div", { class: "w-alerts" });
  el.append(root);
  return subscribe<AlertData>("alerts", 60_000, (d) =>
    alertsList(root, d.alerts, { showAllClear: w.showAllClear, place: ctx.payload.location.name, title: w.title }),
  );
};
