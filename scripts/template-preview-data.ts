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
  "school-days": loadJson("school-days.json"),
  ha: loadJson("ha.json"),
  transit: loadJson("transit.json"),
  commute: loadJson("commute.json"),
  ferries: loadJson("ferries.json"),
  drivebc: loadJson("drivebc.json"),
  border: loadJson("border.json"),
  gas: loadJson("gas.json"),
  sports: loadJson("sports.json"),
  garbage: loadJson("garbage.json"),
  alerts: loadJson("alerts.json"),
  tides: loadJson("tides.json"),
  snow: loadJson("snow.json"),
  aurora: loadJson("aurora.json"),
  "on-this-day": loadJson("on-this-day.json"),
  brief: loadJson("brief.json"),
  quotes: loadJson("quotes.json"),
  radar: loadJson("radar.json"),
  wildfires: loadJson("wildfires.json"),
  tempest: loadJson("tempest.json"),
  airthings: loadJson("airthings.json"),
  laundry: loadJson("laundry.json"),
  rivers: loadJson("rivers.json"),
  rachio: loadJson("rachio.json"),
  blueriiot: loadJson("blueriiot.json"),
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
// Birthdays and anniversaries with a photo each (2026-11-26), so the features sample shows the photo circles and the
// age or years, and Sam's birthday is the sample's day so the tile leads with it. The photos are the template samples, served by the preview server's countdown-photo route.
const samBirthday = {
  id: "sam-bday",
  name: "Sam",
  date: "2018-11-23",
  emoji: "🎂",
  kind: "birthday" as const,
  yearly: true,
  photo: "kids-soccer",
};
const anniversary = {
  id: "anniversary",
  name: "Mom & Dad",
  date: "2011-12-04",
  emoji: "💍",
  kind: "anniversary" as const,
  yearly: true,
  photo: "family-kitchen",
};

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
    case "drivebc":
      return {
        ...widget,
        cameras: [
          { id: "292", name: "Port Mann Bridge - W" },
          { id: "904", name: "Hwy 1 at 176 Street - W" },
        ],
      };
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
      return { ...widget, ssid: "MapleStreetWiFi", password: "come-on-in-2026", showPassword: true, encryption: "WPA" };
    case "sports":
      return { ...widget, teamIds: widget.teamIds.length ? widget.teamIds : ["canucks", "whitecaps"] };
    case "countdown":
      return {
        ...widget,
        events: widget.events.length ? widget.events : [samBirthday, anniversary, christmas, newYear, halloween],
        count: widget.events.length ? widget.count : 3,
      };
    case "packages":
      return {
        ...widget,
        packages: widget.packages.length
          ? widget.packages
          : [
              { id: "pkg-lego", carrier: "ups" as const, trackingNumber: "1Z999AA10123456784", label: "Lego set" },
              { id: "pkg-books", carrier: "canadaPost" as const, trackingNumber: "1234567890123456", label: "Library holds" },
              { id: "pkg-shoes", carrier: "fedex" as const, trackingNumber: "794612345678", label: "Running shoes" },
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
      return { ...widget, text: widget.text && widget.text !== "Have a great day!" ? widget.text : "Door code 4821\nBiscuit eats at 5 PM" };
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

/** The holiday layouts show their own season's photo; every other layout shows everyday family photos (Melvin,
 * 2026-11-26: "all the images just have halloween"). Source ids match scripts/template-samples/photos.json. */
function seasonalPhotos(templateId: string): string[] {
  if (templateId === "christmas" || templateId === "new-year") return ["christmas"];
  if (templateId === "halloween") return ["halloween"];
  return ["sample"];
}

export const TEMPLATE_PREVIEWS: TemplatePreview[] = VIEW_TEMPLATES.map((t) => {
  const built = t.build();
  const themeId = t.themeId ?? "aurora";
  const view = {
    id: t.id,
    name: t.name,
    themeId,
    ...built,
    widgets: built.widgets.map(withDemoBindings).map((w) => (w.type === "photos" ? { ...w, sourceIds: seasonalPhotos(t.id) } : w)),
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

/** Samples drawn bigger than the widget's default size, so their whole sample feed fits (the message board's three notes). */
const SAMPLE_SIZE: Partial<Record<WidgetType, { w: number; h: number }>> = { messages: { w: 4, h: 4 } };

export const WIDGET_PREVIEWS: WidgetPreview[] = WIDGET_TYPES.map((type) => {
  const info = WIDGETS[type];
  const size = { ...info.size, ...SAMPLE_SIZE[type] };
  const seeded = newWidget(type, type, { x: 0, y: 0 });
  const widget = withDemoBindings({
    ...seeded,
    x: 0,
    y: 0,
    w: size.w,
    h: size.h,
    ...(info.supportsTitle === false ? {} : { title: info.label }),
  } as Widget);
  return {
    id: `widget-${type}`,
    type,
    name: info.label,
    cols: size.w,
    rows: size.h,
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

export type FeaturePreview = {
  id: string;
  /** Written to public/features/<file>.png for the "Display behaviour" cards on /features/. */
  file: string;
  cols: number;
  rows: number;
  mode: "day" | "night";
  payload: DisplayPayload;
  /** Sample feeds swapped in for this shot only (the preview server reads SAMPLE_FEEDS by path). */
  feeds: Record<string, unknown>;
  /** Drawn over the wall before the shot: "grid" outlines every cell and names the grid's numbers. */
  overlay?: "grid";
  /** Take the shot with the browser offline, so the wall shows its "Offline" pill over saved data. */
  offline?: boolean;
  /** Only a panel of a composite (below), not a card picture of its own. */
  panelOnly?: boolean;
};

/** A card picture made of several real wall shots side by side, each with a label (Morning, Overnight…). */
export type FeatureComposite = {
  file: string;
  width: number;
  height: number;
  columns: number;
  /** Shown between panels in a row of two (the screen saver's "after 10 minutes"). */
  between?: string;
  panels: { id: string; label: string; note?: string; width: number; height: number }[];
};

const fixed = (w: Partial<Widget> & { type: WidgetType; x: number; y: number; w: number; h: number }): Widget => {
  const info = WIDGETS[w.type];
  return withDemoBindings({
    ...newWidget(w.type, `${w.type}-${w.x}-${w.y}`, { x: w.x, y: w.y }),
    ...(info.supportsTitle === false ? {} : { title: info.label }),
    ...w,
  } as Widget);
};

function featureConfig(viewId: string, widgets: Widget[], grid: { cols?: number; rows?: number; themeId?: string } = {}) {
  const config = defaultConfig();
  const cols = grid.cols ?? Math.max(...widgets.map((w) => w.x + w.w));
  const rows = grid.rows ?? Math.max(...widgets.map((w) => w.y + w.h));
  const themeId = grid.themeId ?? "aurora";
  config.name = "Everydaypane";
  config.themeId = themeId;
  config.themes = structuredClone(BUILT_IN_THEMES);
  config.views = [{ id: viewId, name: viewId, themeId, cols, rows, gap: 16, padding: 14, tilePadding: 16, widgets }];
  config.schedule.enabled = false;
  config.alerts.enabled = false;
  config.screenSaver.idle = false;
  config.screenSaver.night = false;
  config.burnIn.shift = false;
  return config;
}

// Smart notices (2026-11-26): the blue strip with a notice that puts the sprinklers and the forecast together.
const smartNoticeView = featureConfig("feature-smart-notices", [
  fixed({ type: "clock", x: 0, y: 0, w: 3, h: 2 }),
  fixed({ type: "rachio", x: 0, y: 2, w: 3, h: 2 }),
  fixed({ type: "weather", x: 3, y: 0, w: 5, h: 4 }),
]);
smartNoticeView.alerts.enabled = true;

const alertsSample = SAMPLE_FEEDS.alerts as { updatedAt: number; alerts: { notice?: boolean }[] };

const regionAlerts = (alerts: Record<string, unknown>[]) => ({ updatedAt: FIXED_NOW, alerts });

// Regional packs (Melvin, 2026-11-27: screenshots on the features cards): the same widgets in two places, each reading
// its own region's sources. Langley reads Alert Ready, BC Hydro, DriveBC and TransLink; Toronto Alert Ready, Ontario
// 511 and the TTC.
// Six by six: a taller grid would letterbox as a portrait view.
const langleyPack = featureConfig("feature-region-bc", [
  fixed({ type: "alerts", x: 0, y: 0, w: 6, h: 2, title: "Alerts" }),
  fixed({ type: "transit", x: 0, y: 2, w: 6, h: 4, title: "TransLink" }),
]);
const torontoTransit = fixed({ type: "transit", x: 0, y: 2, w: 6, h: 4, title: "TTC" });
const torontoPack = featureConfig("feature-region-on", [
  fixed({ type: "alerts", x: 0, y: 0, w: 6, h: 2, title: "Alerts" }),
  {
    ...torontoTransit,
    agency: "ttc",
    stops: [
      { id: "14235", code: "14235", name: "Queen St West at Spadina" },
      { id: "4321", code: "4321", name: "Spadina Station" },
    ],
  } as Widget,
]);
langleyPack.alerts.enabled = true;
torontoPack.alerts.enabled = true;
torontoPack.location = { ...torontoPack.location, name: "Toronto", latitude: 43.65, longitude: -79.38, timeZone: "America/Toronto" };
const langleyFeeds = {
  alerts: regionAlerts([
    {
      id: "naad-rainfall",
      source: "weather",
      severity: "moderate",
      title: "Rainfall warning",
      area: "Alert Ready · Fraser Valley",
      sent: FIXED_NOW - 3 * 3_600_000,
      expires: null,
    },
    {
      id: "bchydro-1",
      source: "power",
      severity: "minor",
      title: "Power outage 3 km away",
      area: "BC Hydro · Walnut Grove · 412 customers",
      sent: FIXED_NOW - 3_600_000,
      expires: null,
    },
    {
      id: "drivebc-1",
      source: "roads",
      severity: "minor",
      title: "Hwy 1 eastbound lane closed",
      area: "DriveBC · 200 Street to 232 Street",
      sent: FIXED_NOW - 2 * 3_600_000,
      expires: null,
    },
  ]),
};
const ttcAt = (min: number) => Math.round(FIXED_NOW / 1000) + min * 60;
const torontoFeeds = {
  alerts: regionAlerts([
    {
      id: "naad-snow",
      source: "weather",
      severity: "moderate",
      title: "Snowfall warning",
      area: "Alert Ready · City of Toronto",
      sent: FIXED_NOW - 2 * 3_600_000,
      expires: null,
    },
    {
      id: "on511-1",
      source: "roads",
      severity: "minor",
      title: "Gardiner Expressway lane closed",
      area: "Ontario 511 · Eastbound at Spadina Avenue",
      sent: FIXED_NOW - 3_600_000,
      expires: null,
    },
  ]),
  transit: {
    updatedAt: FIXED_NOW,
    configured: true,
    stops: {
      "ttc:14235": [
        { route: "501", headsign: "Long Branch", time: ttcAt(3), delay: 0, live: true },
        { route: "510", headsign: "Union Station", time: ttcAt(6), delay: 60, live: true },
        { route: "501", headsign: "Neville Park", time: ttcAt(11), delay: null, live: false },
      ],
      "ttc:4321": [
        { route: "1", headsign: "Vaughan Metropolitan Centre", time: ttcAt(2), delay: 0, live: true },
        { route: "1", headsign: "Finch", time: ttcAt(7), delay: 0, live: true },
        { route: "510", headsign: "Union Station", time: ttcAt(9), delay: 0, live: true },
      ],
    },
  },
};

// Multi-view grid: a 12 × 6 wall with room left over, so the cells, the gap and the edge show under the outline.
const gridView = featureConfig(
  "feature-grid",
  [
    fixed({ type: "clock", x: 0, y: 0, w: 3, h: 2 }),
    fixed({ type: "weather", x: 3, y: 0, w: 5, h: 3 }),
    fixed({ type: "calendarUpNext", x: 8, y: 0, w: 4, h: 3 }),
    fixed({ type: "date", x: 0, y: 2, w: 3, h: 1 }),
    fixed({ type: "agenda", x: 0, y: 3, w: 5, h: 3 }),
    fixed({ type: "garbage", x: 9, y: 4, w: 3, h: 2 }),
  ],
  { cols: 12, rows: 6 },
);

// Widgets on photos: the photo fills the wall and the panels sit on top of it.
const onPhotoView = featureConfig("feature-on-photos", [
  { ...fixed({ type: "photos", x: 0, y: 0, w: 12, h: 6 }), sourceIds: ["sample"], showCaption: false } as Widget,
  fixed({ type: "clock", x: 0, y: 0, w: 3, h: 2, showBackground: false }),
  fixed({ type: "date", x: 0, y: 2, w: 3, h: 1, showBackground: false }),
  fixed({ type: "weather", x: 0, y: 4, w: 5, h: 2 }),
  fixed({ type: "calendarUpNext", x: 8, y: 0, w: 4, h: 3 }),
]);

// Offline: an everyday wall drawn from saved data with the amber pill in the corner.
const offlineView = featureConfig("feature-offline", [
  fixed({ type: "clock", x: 0, y: 0, w: 3, h: 2 }),
  fixed({ type: "date", x: 0, y: 2, w: 3, h: 1 }),
  fixed({ type: "weather", x: 3, y: 0, w: 5, h: 3 }),
  fixed({ type: "agenda", x: 0, y: 3, w: 4, h: 3 }),
  fixed({ type: "meals", x: 4, y: 3, w: 4, h: 3 }),
  fixed({ type: "messages", x: 8, y: 0, w: 4, h: 6 }),
]);

export const FEATURE_PREVIEWS: FeaturePreview[] = [
  {
    id: "feature-smart-notices",
    file: "smart-notices",
    cols: 8,
    rows: 4,
    mode: "day",
    payload: displayPayload(smartNoticeView, 1, null, "feature-smart-notices", { instantRefresh: false }),
    feeds: { alerts: { ...alertsSample, alerts: alertsSample.alerts.filter((a) => a.notice) } },
  },
  {
    id: "feature-region-bc",
    file: "region-bc",
    cols: 6,
    rows: 6,
    mode: "day",
    payload: displayPayload(langleyPack, 1, null, "feature-region-bc", { instantRefresh: false }),
    feeds: langleyFeeds,
    panelOnly: true,
  },
  {
    id: "feature-region-on",
    file: "region-on",
    cols: 6,
    rows: 6,
    mode: "day",
    payload: displayPayload(torontoPack, 1, null, "feature-region-on", { instantRefresh: false }),
    feeds: torontoFeeds,
    panelOnly: true,
  },
  {
    id: "feature-grid",
    file: "multi-view-grid",
    cols: 12,
    rows: 6,
    mode: "day",
    payload: displayPayload(gridView, 1, null, "feature-grid", { instantRefresh: false }),
    feeds: {},
    overlay: "grid",
  },
  {
    id: "feature-on-photos",
    file: "widgets-on-photos",
    cols: 12,
    rows: 6,
    mode: "day",
    payload: displayPayload(onPhotoView, 1, null, "feature-on-photos", { instantRefresh: false }),
    feeds: {},
  },
  {
    id: "feature-offline",
    file: "offline-burn-in",
    cols: 12,
    rows: 6,
    mode: "day",
    payload: displayPayload(offlineView, 1, null, "feature-offline", { instantRefresh: false }),
    feeds: {},
    offline: true,
  },
];

// Composites: real wall shots next to each other. Template ids are the starter templates' own previews.
const HD = { width: 1920, height: 1080 };
export const FEATURE_COMPOSITES: FeatureComposite[] = [
  {
    file: "regional-packs",
    width: 1600,
    height: 880,
    columns: 2,
    panels: [
      { id: "feature-region-bc", label: "Langley, B.C.", width: 960, height: 960 },
      { id: "feature-region-on", label: "Toronto, Ont.", width: 960, height: 960 },
    ],
  },
  {
    file: "time-of-day",
    width: 1920,
    height: 1200,
    columns: 2,
    panels: [
      { id: "kitchen-glance", label: "Morning", note: "From 6:00 AM", ...HD },
      { id: "family-hub", label: "Afternoon", note: "From noon", ...HD },
      { id: "kitchen-command", label: "Evening", note: "From sunset", ...HD },
      { id: "night-clock", label: "Overnight", note: "From 10:00 PM, night mode and dimmed", ...HD },
    ],
  },
  {
    file: "screen-saver",
    width: 1920,
    height: 620,
    columns: 2,
    between: "After 10 minutes idle",
    panels: [
      { id: "kitchen-glance", label: "In Use", ...HD },
      { id: "photo-frame", label: "Photo Frame", note: "A tap wakes it", ...HD },
    ],
  },
];
