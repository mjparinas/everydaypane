import { describe, expect, it } from "vitest";

import { defaultConfig } from "./config/defaults";
import type { DashboardConfig, Widget } from "./config/schema";
import { WIDGET_TYPES } from "./config/widgets";
import {
  applyFlags,
  FEATURE_FLAGS,
  flagsForWidget,
  isFeatureFlag,
  LEGACY_FLAGS,
  musicFlag,
  photoFlag,
  SETTINGS_FLAGS,
  settingsSectionOn,
  smartHomeFlag,
  widgetFlag,
} from "./featureFlags";

const base = { x: 0, y: 0, w: 2, h: 2, showBackground: true } as const;

function withWidgets(widgets: Widget[]): DashboardConfig {
  const c = defaultConfig();
  c.views = [{ ...c.views[0]!, widgets }];
  return c;
}

describe("feature flag registry", () => {
  it("has a flag for every widget, so a new widget gets one automatically", () => {
    for (const type of WIDGET_TYPES) expect(isFeatureFlag(widgetFlag(type)), type).toBe(true);
  });

  it("covers the integrations Melvin listed", () => {
    for (const name of [
      "widget.internet",
      "widget.unifi",
      "widget.windy",
      "widget.wildfires",
      "widget.ecoflow",
      "widget.oura",
      "widget.airthings",
      "widget.rivers",
      "widget.borderWait",
      "widget.snow",
      "widget.drivebc",
      "widget.rachio",
      "widget.tides",
      "widget.transit",
      "widget.commute",
      "widget.ferries",
      "widget.sports",
      "widget.earth",
      "smartHome.govee",
      "smartHome.hue",
      "smartHome.lifx",
      "smartHome.nest",
      "smartHome.ecobee",
      "smartHome.smartthings",
      "music.spotify",
      "music.sonos",
    ])
      expect(isFeatureFlag(name), name).toBe(true);
  });

  it("has unique names, all on by default", () => {
    expect(new Set(FEATURE_FLAGS.map((f) => f.name)).size).toBe(FEATURE_FLAGS.length);
    expect(FEATURE_FLAGS.every((f) => f.default)).toBe(true);
  });

  it("maps legacy flags and settings cards only to real flags", () => {
    for (const names of [...Object.values(LEGACY_FLAGS), ...Object.values(SETTINGS_FLAGS)])
      for (const n of names) expect(isFeatureFlag(n), n).toBe(true);
  });
});

describe("flagsForWidget", () => {
  it("adds the provider for smart devices, music and to-dos", () => {
    const light: Widget = { ...base, id: "l", type: "haEntity", provider: "hue", entityId: "hue.kitchen", control: "light" };
    expect(flagsForWidget(light)).toEqual(["widget.haEntity", "smartHome.hue"]);
    const music = { ...base, id: "m", type: "media", provider: "homeAssistant" } as Widget;
    expect(flagsForWidget(music)).toEqual(["widget.media", "smartHome.homeAssistant"]);
    const camera = { ...base, id: "c", type: "camera" } as Widget;
    expect(flagsForWidget(camera)).toEqual(["widget.camera", "smartHome.homeAssistant"]);
  });
});

describe("applyFlags", () => {
  it("returns the same document when nothing is off", () => {
    const c = defaultConfig();
    expect(applyFlags(c, new Set())).toBe(c);
  });

  it("drops widgets whose type or provider is off, and leaves the original alone", () => {
    const c = withWidgets([
      { ...base, id: "clock", type: "clock", timeZone: "America/Vancouver", label: "", showSeconds: false, style: "digital" },
      { ...base, id: "hue", type: "haEntity", provider: "hue", entityId: "hue.a", control: "light" },
      { ...base, id: "nest", type: "haEntity", provider: "nest", entityId: "nest.a", control: "climate" },
      { ...base, id: "spotify", type: "media", provider: "spotify" } as Widget,
    ]);
    const out = applyFlags(c, new Set([smartHomeFlag("hue"), musicFlag("spotify"), widgetFlag("clock")]));
    expect(out.views[0]!.widgets.map((w) => w.id)).toEqual(["nest"]);
    expect(c.views[0]!.widgets).toHaveLength(4);
  });

  it("drops switched-off photo sources, and a photos widget left with none of its picks", () => {
    const c = withWidgets([
      { ...base, id: "p1", type: "photos", sourceIds: ["amz"], intervalSeconds: 30, fit: "cover", showCaption: false },
      { ...base, id: "p2", type: "photos", sourceIds: ["amz", "lib"], intervalSeconds: 30, fit: "cover", showCaption: false },
      { ...base, id: "p3", type: "photos", sourceIds: [], intervalSeconds: 30, fit: "cover", showCaption: false },
    ]);
    c.integrations.photos.sources = [
      { id: "amz", kind: "amazonShare", name: "A", url: "https://www.amazon.com/photos/share/x" },
      { id: "lib", kind: "library", name: "L" },
    ];
    const out = applyFlags(c, new Set([photoFlag("amazonShare")]));
    expect(out.integrations.photos.sources.map((s) => s.id)).toEqual(["lib"]);
    const widgets = out.views[0]!.widgets;
    expect(widgets.map((w) => w.id)).toEqual(["p2", "p3"]);
    expect(widgets[0]!.type === "photos" && widgets[0]!.sourceIds).toEqual(["lib"]);
  });

  it("turns off the doorbell, motion sensors and Airthings alerts with their flags", () => {
    const c = defaultConfig();
    c.integrations.homeAssistant.doorbell = { entityId: "event.ring", cameraEntityId: "camera.door", seconds: 30 };
    c.screenSaver.motionEntityIds = ["binary_sensor.kitchen"];
    c.integrations.smartHome.airthings.alertRadon = true;
    const out = applyFlags(c, new Set([smartHomeFlag("homeAssistant"), widgetFlag("airthings")]));
    expect(out.integrations.homeAssistant.doorbell.entityId).toBe("");
    expect(out.screenSaver.motionEntityIds).toEqual([]);
    expect(out.integrations.smartHome.airthings.alertRadon).toBe(false);
  });
});

describe("settingsSectionOn", () => {
  it("hides a card only when every flag it needs is off", () => {
    const off = new Set(["widget.tempest"]);
    const on = (n: string) => !off.has(n);
    expect(settingsSectionOn("weather-stations", on)).toBe(true);
    off.add("widget.weatherUnderground");
    expect(settingsSectionOn("weather-stations", on)).toBe(false);
    expect(settingsSectionOn("location", on)).toBe(true);
  });
});
