import type { Widget } from "@/lib/config/schema";

import { airQuality } from "./air";
import { alerts } from "./alerts";
import { agenda, calendarMonth } from "./calendar";
import { chores } from "./chores";
import { clock } from "./clock";
import { commute } from "./commute";
import { countdown } from "./countdown";
import { date } from "./date";
import { garbage } from "./garbage";
import { camera, haEntity } from "./ha";
import { meals } from "./meals";
import { media } from "./media";
import { messages } from "./messages";
import { note } from "./note";
import { photos } from "./photos";
import { tasks } from "./tasks";
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
    case "messages":
      return messages(el, w, ctx);
    case "meals":
      return meals(el, w, ctx);
    case "agenda":
      return agenda(el, w, ctx);
    case "calendarMonth":
      return calendarMonth(el, w, ctx);
    case "garbage":
      return garbage(el, w, ctx);
    case "alerts":
      return alerts(el, w, ctx);
    case "photos":
      return photos(el, w, ctx);
    case "haEntity":
      return haEntity(el, w, ctx);
    case "camera":
      return camera(el, w, ctx);
    case "tasks":
      return tasks(el, w, ctx);
    case "media":
      return media(el, w, ctx);
    case "commute":
      return commute(el, w, ctx);
    case "chores":
      return chores(el, w, ctx);
  }
}
