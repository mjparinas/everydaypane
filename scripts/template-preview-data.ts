import { readFileSync } from "node:fs";
import { join } from "node:path";

import { defaultConfig } from "../src/lib/config/defaults";
import type { Widget, WidgetType } from "../src/lib/config/schema";
import { VIEW_TEMPLATES } from "../src/lib/config/templates";
import { BUILT_IN_THEMES } from "../src/lib/config/themes";
import { newWidget, WIDGET_TYPES, WIDGETS } from "../src/lib/config/widgets";
import { displayPayload } from "../src/lib/display/payload";
import type { DisplayPayload } from "../src/lib/display/types";

// Bundled by scripts/render-template-previews.mjs. Builds a DisplayPayload per starter template and per widget
// type, and loads the shared sample feeds so Playwright can screenshot the real display widgets (not a CSS mock).

// Resolved from cwd (the repo root) because this file is bundled into node_modules/.cache/.
const samples = join(process.cwd(), "scripts", "template-samples");

export const FIXED_NOW = Date.parse("2026-11-23T15:42:00-07:00");
export const FIXED_NOW_ISO = "2026-11-23T15:42:00-07:00";

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(samples, name), "utf8")) as T;
}

export const SAMPLE_FEEDS: Record<string, unknown> = {
  calendar: loadJson("calendar.json"),
  weather: loadJson("weather.json"),
  air: loadJson("air.json"),
  photos: loadJson("photos.json"),
  messages: loadJson("messages.json"),
  meals: loadJson("meals.json"),
  shopping: loadJson("shopping.json"),
  chores: loadJson("chores.json"),
  tasks: loadJson("tasks.json"),
  school: loadJson("school.json"),
  ha: loadJson("ha.json"),
  transit: loadJson("transit.json"),
  commute: loadJson("commute.json"),
  ferries: loadJson("ferries.json"),
  sports: loadJson("sports.json"),
  garbage: loadJson("garbage.json"),
  alerts: loadJson("alerts.json"),
  tides: loadJson("tides.json"),
  quotes: loadJson("quotes.json"),
  radar: loadJson("radar.json"),
  wildfires: loadJson("wildfires.json"),
  tempest: loadJson("tempest.json"),
  airthings: loadJson("airthings.json"),
  laundry: loadJson("laundry.json"),
  rivers: loadJson("rivers.json"),
  ecoflow: loadJson("ecoflow.json"),
  "weather-underground": loadJson("weather-underground.json"),
  unifi: loadJson("unifi.json"),
  menus: loadJson("menus.json"),
  packages: loadJson("packages.json"),
  stocks: loadJson("stocks.json"),
  crypto: loadJson("crypto.json"),
  fx: loadJson("fx.json"),
  ynab: loadJson("ynab.json"),
  fitbit: loadJson("fitbit.json"),
  oura: loadJson("oura.json"),
  "email-count": loadJson("email-count.json"),
  rss: loadJson("rss.json"),
  trello: loadJson("trello.json"),
  slack: loadJson("slack.json"),
  airports: loadJson("airports.json"),
  whiteboard: loadJson("whiteboard.json"),
};

const christmas = { id: "christmas", name: "Christmas", date: "2026-12-25", emoji: "🎄", kind: "holiday" as const, yearly: true };
const newYear = { id: "new-year", name: "New Year's Day", date: "2027-01-01", emoji: "🎆", kind: "holiday" as const, yearly: true };
const halloween = { id: "halloween", name: "Halloween", date: "2027-10-31", emoji: "🎃", kind: "holiday" as const, yearly: true };

/** Widgets that need demo entity / stop wiring so empty settings don't blank the screenshot. */
export function withDemoBindings(widget: Widget): Widget {
  switch (widget.type) {
    case "presence":
      return {
        ...widget,
        entities: [
          { entityId: "person.melvin", label: "Melvin" },
          { entityId: "person.partner", label: "Alex" },
          { entityId: "person.maya", label: "Maya" },
          { entityId: "person.sam", label: "Sam" },
        ],
      };
    case "haEntity":
      if (widget.control === "climate" || widget.title === "Thermostat") {
        return { ...widget, entityId: "climate.house", control: "climate", title: widget.title || "Thermostat" };
      }
      return { ...widget, entityId: "light.kitchen", control: "light", title: widget.title || "Kitchen" };
    case "camera":
      return { ...widget, entityId: "camera.front_door" };
    case "media":
      return { ...widget, provider: "homeAssistant", entityId: "media_player.kitchen" };
    case "transit":
      return {
        ...widget,
        stops: [
          { id: "6099", code: "6099", name: "Langley Centre" },
          { id: "6103", code: "6103", name: "200 St @ 64 Ave" },
        ],
      };
    case "wifiQr":
      return { ...widget, ssid: "ParinasHome", password: "welcome-friends", showPassword: true, encryption: "WPA" };
    case "sports":
      return { ...widget, teamIds: widget.teamIds.length ? widget.teamIds : ["canucks", "whitecaps"] };
    case "countdown":
      return {
        ...widget,
        events: widget.events.length ? widget.events : [christmas, newYear, halloween],
        count: widget.count || 3,
      };
    case "packages":
      return {
        ...widget,
        packages: widget.packages.length
          ? widget.packages
          : [
              { id: "pkg-lego", carrier: "ups" as const, trackingNumber: "1Z999AA10123456784", label: "Lego set" },
              { id: "pkg-books", carrier: "canadaPost" as const, trackingNumber: "1234567890123456", label: "Library holds" },
            ],
        showDelivered: false,
      };
    case "menus":
      return { ...widget, school: widget.school || "douglas-park-elementary", days: 2, slots: ["breakfast", "lunch"] };
    case "rss":
      return {
        ...widget,
        feeds: widget.feeds.length ? widget.feeds : [{ id: "cbc", name: "CBC", url: "https://example.com/cbc.rss" }],
      };
    case "note":
      return { ...widget, text: widget.text || "Soccer kits by the door — practice at 5." };
    case "youtube":
      return { ...widget, videoId: widget.videoId || "dQw4w9WgXcQ", mode: "video" };
    case "vimeo":
      return { ...widget, videoId: widget.videoId || "148751763" };
    case "instagram":
      return { ...widget, embedUrl: widget.embedUrl || "https://www.instagram.com/p/CxSamplePost/" };
    case "trello":
      return { ...widget, boardId: widget.boardId || "family-board" };
    case "maps":
      return { ...widget, query: widget.query || "Langley, BC", zoom: widget.zoom || 12 };
    case "tradingView":
      return { ...widget, symbol: widget.symbol || "TSX:RY" };
    default:
      return widget;
  }
}

function basePreviewConfig(viewId: string, widgets: Widget[], themeId: string) {
  const cols = Math.max(...widgets.map((w) => w.x + w.w), 1);
  const rows = Math.max(...widgets.map((w) => w.y + w.h), 1);
  const view = {
    id: viewId,
    name: viewId,
    themeId,
    cols,
    rows,
    gap: widgets.length === 1 ? 0 : 16,
    padding: widgets.length === 1 ? 0 : 14,
    tilePadding: 16,
    widgets,
  };
  const config = defaultConfig();
  config.name = "Everydaypane";
  config.themeId = themeId;
  config.themes = structuredClone(BUILT_IN_THEMES);
  config.views = [view];
  config.schedule.enabled = false;
  config.alerts.enabled = false;
  config.screenSaver.idle = false;
  config.screenSaver.night = false;
  config.burnIn.shift = false;
  return displayPayload(config, 1, null, viewId, { instantRefresh: false });
}

export type TemplatePreview = {
  id: string;
  name: string;
  category: string;
  tier: string;
  themeId: string | null;
  /** Force night palette for a few templates so the gallery shows both modes. */
  mode: "day" | "night";
  payload: DisplayPayload;
};

export const TEMPLATE_PREVIEWS: TemplatePreview[] = VIEW_TEMPLATES.map((t) => {
  const built = t.build();
  const themeId = t.themeId ?? "aurora";
  const view = {
    id: t.id,
    name: t.name,
    themeId,
    ...built,
    widgets: built.widgets.map(withDemoBindings),
  };
  const config = defaultConfig();
  config.name = "Everydaypane";
  config.themeId = themeId;
  config.themes = structuredClone(BUILT_IN_THEMES);
  config.views = [view];
  config.schedule.enabled = false;
  config.alerts.enabled = false;
  config.screenSaver.idle = false;
  config.screenSaver.night = false;
  config.burnIn.shift = false;
  const payload = displayPayload(config, 1, null, t.id, { instantRefresh: false });
  return {
    id: t.id,
    name: t.name,
    category: t.category,
    tier: t.tier,
    themeId: t.themeId,
    mode: t.id === "night-clock" ? "night" : "day",
    payload,
  };
});

export type WidgetPreview = {
  id: string;
  type: WidgetType;
  name: string;
  /** Grid cells; used to size the Playwright viewport. */
  cols: number;
  rows: number;
  mode: "day" | "night";
  payload: DisplayPayload;
};

export const WIDGET_PREVIEWS: WidgetPreview[] = WIDGET_TYPES.map((type) => {
  const info = WIDGETS[type];
  const seeded = newWidget(type, type, { x: 0, y: 0 });
  const widget = withDemoBindings({
    ...seeded,
    x: 0,
    y: 0,
    w: info.size.w,
    h: info.size.h,
    ...(info.supportsTitle === false ? {} : { title: info.label }),
  } as Widget);
  return {
    id: `widget-${type}`,
    type,
    name: info.label,
    cols: info.size.w,
    rows: info.size.h,
    mode: "day" as const,
    payload: basePreviewConfig(`widget-${type}`, [widget], "aurora"),
  };
});

export function displayShell(opts: { templateId: string; mode: "day" | "night"; assetVersion: string }): string {
  const v = opts.assetVersion;
  return `<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#000000">
<title>${opts.templateId} · Everydaypane</title>
<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/manrope.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/space-grotesk.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/outfit.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/dm-sans.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/literata.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/display/display.css?v=${v}">
<script type="module" src="/display/display.js?v=${v}"></script>
</head>
<body data-v="${v}" data-preview="${opts.templateId}" data-preview-mode="${opts.mode}">
<div id="app" class="boot"><div class="boot-logo" aria-hidden="true"></div></div>
</body>
</html>`;
}
