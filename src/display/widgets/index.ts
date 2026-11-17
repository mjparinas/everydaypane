import type { Widget } from "@/lib/config/schema";

import { airQuality } from "./air";
import { clock } from "./clock";
import { countdown } from "./countdown";
import { date } from "./date";
import { note } from "./note";
import { placeholder } from "./placeholder";
import type { Cleanup, WidgetContext } from "./types";
import { weather } from "./weather";
import { wifiQr } from "./wifi";

/** Mounts a widget into its cell and returns what stops its timers. A widget that throws shows a quiet error, never a blank screen. */
export function mountWidget(el: HTMLElement, w: Widget, ctx: WidgetContext): Cleanup {
  switch (w.type) {
    case "clock":
      return clock(el, w, ctx);
    case "date":
      return date(el, w, ctx);
    case "weather":
      return weather(el, w, ctx);
    case "airQuality":
      return airQuality(el, w, ctx);
    case "wifiQr":
      return wifiQr(el, w, ctx);
    case "countdown":
      return countdown(el, w, ctx);
    case "note":
      return note(el, w, ctx);
    case "agenda":
    case "calendarMonth":
    case "garbage":
    case "photos":
    case "haEntity":
    case "messages":
    case "alerts":
    case "camera":
      return placeholder(el, w.type);
  }
}
