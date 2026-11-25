import { windyUrl } from "@/lib/windy";

import { mountIframe } from "./iframeMount";
import type { Mount } from "./types";

// Windy weather map (Melvin, 2026-11-21: "do windy"). Windy's own embed in a frame, which is far heavier than the
// rest of the wall (a WebGL map and its forecast data), so like the earth map it exists only while it can be seen: it
// is removed while the screen saver is up or the page is hidden, made again on waking, and made again every half
// hour for new radar and forecasts. Unless the widget is interactive it takes no touches, so a hand brushing the
// screen can't pan the map away from the place, and the screen saver still hears the tap.

export const WINDY_RELOAD_MS = 30 * 60_000;

export const windy: Mount<"windy"> = (el, w, ctx) =>
  mountIframe(el, "Windy weather map", () => windyUrl({ ...w, units: ctx.payload.units }), {
    reloadMs: WINDY_RELOAD_MS,
    // Scripts and its own storage only: no pop-ups, and it can never move the dashboard away.
    sandbox: "allow-scripts allow-same-origin",
    className: w.interactive ? "w-embed w-windy wy-live" : "w-embed w-windy",
  });
