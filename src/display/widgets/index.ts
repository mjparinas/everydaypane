import type { Widget } from "@/lib/config/schema";

import { airQuality } from "./air";
import { alerts } from "./alerts";
import { agenda, calendarMonth, calendarUpNext, calendarWeek } from "./calendar";
import { chores } from "./chores";
import { clock } from "./clock";
import { commute } from "./commute";
import { countdown } from "./countdown";
import { date } from "./date";
import { earth } from "./earth";
import { editQr } from "./editQr";
import { ferries } from "./ferries";
import { garbage } from "./garbage";
import { camera, haEntity } from "./ha";
import { meals } from "./meals";
import { media } from "./media";
import { messages } from "./messages";
import { note } from "./note";
import { photos } from "./photos";
import { pomodoro } from "./pomodoro";
import { presence } from "./presence";
import { radar } from "./radar";
import { school } from "./school";
import { shopping } from "./shopping";
import { sports } from "./sports";
import { sunTimes } from "./sunTimes";
import { tasks } from "./tasks";
import { timer } from "./timer";
import { transit } from "./transit";
import type { Cleanup, WidgetContext } from "./types";
import { weather } from "./weather";
import { whiteboard } from "./whiteboard";
import { wifiQr } from "./wifi";

/** Mounts a widget into its cell and returns what stops its timers. A widget that throws shows a quiet error, never a blank screen. */
export function mountWidget(el: HTMLElement, w: Widget, ctx: WidgetContext): Cleanup {
  switch (w.type) {
    case "clock":
      return clock(el, w, ctx);
    case "date":
      return date(el, w, ctx);
    case "sunTimes":
      return sunTimes(el, w, ctx);
    case "weather":
      return weather(el, w, ctx);
    case "airQuality":
      return airQuality(el, w, ctx);
    case "wifiQr":
      return wifiQr(el, w, ctx);
    case "editQr":
      return editQr(el, w, ctx);
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
    case "calendarWeek":
      return calendarWeek(el, w, ctx);
    case "calendarUpNext":
      return calendarUpNext(el, w, ctx);
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
    case "radar":
      return radar(el, w, ctx);
    case "chores":
      return chores(el, w, ctx);
    case "shopping":
      return shopping(el, w, ctx);
    case "timer":
      return timer(el, w, ctx);
    case "pomodoro":
      return pomodoro(el, w, ctx);
    case "ferries":
      return ferries(el, w, ctx);
    case "transit":
      return transit(el, w, ctx);
    case "sports":
      return sports(el, w, ctx);
    case "earth":
      return earth(el, w, ctx);
    case "presence":
      return presence(el, w, ctx);
    case "school":
      return school(el, w, ctx);
    case "whiteboard":
      return whiteboard(el, w, ctx);
    default:
      // A widget type with no screen yet (still being built) leaves an empty cell instead of crashing the dashboard.
      return () => undefined;
  }
}
