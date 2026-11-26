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
import { camera } from "./ha";
import { lazyWidget } from "./lazy";
import { meals } from "./meals";
import { media } from "./media";
import { menus } from "./menus";
import { messages } from "./messages";
import { note } from "./note";
import {
  affirmation,
  airports,
  crypto,
  dadJoke,
  emailCount,
  fitbit,
  fx,
  horoscope,
  instagram,
  maps,
  news,
  quotes,
  rss,
  slack,
  stocks,
  tradingView,
  trello,
  vimeo,
  ynab,
  youtube,
} from "./phase5";
import { photos } from "./photos";
import { pomodoro } from "./pomodoro";
import { presence } from "./presence";
import { radar } from "./radar";
import { school } from "./school";
import { shopping } from "./shopping";
import { sports } from "./sports";
import { sunTimes } from "./sunTimes";
import { tasks } from "./tasks";
import { tempest } from "./tempest";
import { timer } from "./timer";
import { transit } from "./transit";
import type { Cleanup, WidgetContext } from "./types";
import { weather } from "./weather";
import { weatherUnderground } from "./weatherUnderground";
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
    case "tempest":
      return tempest(el, w, ctx);
    case "unifi":
      return lazyWidget("unifi", el, w, ctx);
    case "weatherUnderground":
      return weatherUnderground(el, w, ctx);
    case "borderWait":
      return lazyWidget("borderWait", el, w, ctx);
    case "gasPrices":
      return lazyWidget("gasPrices", el, w, ctx);
    case "airthings":
      return lazyWidget("airthings", el, w, ctx);
    case "laundry":
      return lazyWidget("laundry", el, w, ctx);
    case "drivebc":
      return lazyWidget("drivebc", el, w, ctx);
    case "snow":
      return lazyWidget("snow", el, w, ctx);
    case "rivers":
      return lazyWidget("rivers", el, w, ctx);
    case "ecoflow":
      return lazyWidget("ecoflow", el, w, ctx);
    case "rachio":
      return lazyWidget("rachio", el, w, ctx);
    case "blueRiiot":
      return lazyWidget("blueRiiot", el, w, ctx);
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
    case "menus":
      return menus(el, w, ctx);
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
      return lazyWidget("haEntity", el, w, ctx);
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
    case "wildfires":
      return lazyWidget("wildfires", el, w, ctx);
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
    case "packages":
      return lazyWidget("packages", el, w, ctx);
    case "tides":
      return lazyWidget("tides", el, w, ctx);
    case "moon":
      return lazyWidget("moon", el, w, ctx);
    case "aurora":
      return lazyWidget("aurora", el, w, ctx);
    case "onThisDay":
      return lazyWidget("onThisDay", el, w, ctx);
    case "brief":
      return lazyWidget("brief", el, w, ctx);
    case "transit":
      return transit(el, w, ctx);
    case "sports":
      return sports(el, w, ctx);
    case "earth":
      return earth(el, w, ctx);
    case "windy":
      return lazyWidget("windy", el, w, ctx);
    case "presence":
      return presence(el, w, ctx);
    case "school":
      return school(el, w, ctx);
    case "schoolDays":
      return lazyWidget("schoolDays", el, w, ctx);
    case "whiteboard":
      return lazyWidget("whiteboard", el, w, ctx);
    case "stocks":
      return stocks(el, w, ctx);
    case "crypto":
      return crypto(el, w, ctx);
    case "fx":
      return fx(el, w, ctx);
    case "ynab":
      return ynab(el, w, ctx);
    case "tradingView":
      return tradingView(el, w, ctx);
    case "fitbit":
      return fitbit(el, w, ctx);
    case "oura":
      return lazyWidget("oura", el, w, ctx);
    case "emailCount":
      return emailCount(el, w, ctx);
    case "rss":
      return rss(el, w, ctx);
    case "news":
      return news(el, w, ctx);
    case "dadJoke":
      return dadJoke(el, w, ctx);
    case "quotes":
      return quotes(el, w, ctx);
    case "affirmation":
      return affirmation(el, w, ctx);
    case "horoscope":
      return horoscope(el, w, ctx);
    case "instagram":
      return instagram(el, w, ctx);
    case "trello":
      return trello(el, w, ctx);
    case "slack":
      return slack(el, w, ctx);
    case "youtube":
      return youtube(el, w, ctx);
    case "vimeo":
      return vimeo(el, w, ctx);
    case "airports":
      return airports(el, w, ctx);
    case "maps":
      return maps(el, w, ctx);
    case "internet":
      return lazyWidget("internet", el, w, ctx);
    default:
      // A widget type with no screen yet (still being built) leaves an empty cell instead of crashing the dashboard.
      return () => undefined;
  }
}
