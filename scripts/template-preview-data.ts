import { readFileSync } from "node:fs";
import { join } from "node:path";

import { defaultConfig } from "../src/lib/config/defaults";
import type { Widget } from "../src/lib/config/schema";
import { VIEW_TEMPLATES } from "../src/lib/config/templates";
import { BUILT_IN_THEMES } from "../src/lib/config/themes";
import { displayPayload } from "../src/lib/display/payload";
import type { DisplayPayload } from "../src/lib/display/types";

// Bundled by scripts/render-template-previews.mjs. Builds a DisplayPayload per starter template and loads the shared
// sample feeds so Playwright can screenshot the real display widgets (not a CSS mock).

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
};

/** Widgets that need demo entity / stop wiring so empty settings don't blank the screenshot. */
function withDemoBindings(widget: Widget): Widget {
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
      return { ...widget, teamIds: ["canucks", "whitecaps"] };
    default:
      return widget;
  }
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
