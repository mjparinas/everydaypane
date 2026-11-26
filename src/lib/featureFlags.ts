import type { DashboardConfig, PhotoSource, Widget, WidgetType } from "./config/schema";
import { WIDGET_GROUPS, WIDGET_TYPES, WIDGETS } from "./config/widgets";
import type { SmartHomeProvider } from "./smartHome";

// Platform feature flags (Melvin, 2026-11-26: "feature flags in the admin area for all of these integrations").
// One registry, built from the widget catalogue plus every provider and photo source the schema allows, so a new
// widget, provider or photo source gets a flag with no extra step (the typed records below fail to compile until a
// new provider or source has a label). Staff switch a flag for everyone in /admin/ › Flags, or for one household
// from its page there; a household override wins over the platform value. A flag that is off hides the widget from
// the picker and its Settings, and the display's copy of the settings drops it (`applyFlags`), so its feed is never
// polled and the server never calls the service for that household. Kept free of zod and React: the household panel,
// the server and the tests all import it.

export type FlagKind = "widget" | "smartHome" | "music" | "tasks" | "photos";

export interface FeatureFlag {
  name: string;
  label: string;
  description: string;
  group: string;
  kind: FlagKind;
  /** Every flag is on until staff turn it off. */
  default: boolean;
}

type MediaProvider = Extract<Widget, { type: "media" }>["provider"];
type TasksProvider = Extract<Widget, { type: "tasks" }>["provider"];
type PhotoKind = PhotoSource["kind"];

const SMART_HOME: { [P in SmartHomeProvider]: { label: string; description: string } } = {
  homeAssistant: {
    label: "Home Assistant",
    description: "Smart device tiles, cameras, the doorbell pop-up, who's home, motion sensors and music through Home Assistant.",
  },
  nest: { label: "Nest", description: "Google Nest thermostats and cameras through Device Access." },
  ecobee: { label: "ecobee", description: "ecobee thermostats signed in directly." },
  smartthings: { label: "SmartThings", description: "Samsung SmartThings devices signed in directly." },
  govee: { label: "Govee lights", description: "Govee lights with the household's API key." },
  hue: { label: "Philips Hue lights", description: "Hue lights through the Hue Remote API." },
  lifx: { label: "LIFX lights", description: "LIFX lights with the household's personal token." },
};

const MUSIC: { [P in Exclude<MediaProvider, "homeAssistant">]: { label: string; description: string } } = {
  spotify: { label: "Spotify", description: "The Music widget signed in to Spotify directly." },
  sonos: { label: "Sonos", description: "The Music widget signed in to Sonos directly." },
};

const TASKS: { [P in TasksProvider]: { label: string; description: string } } = {
  google: { label: "Google Tasks", description: "To-dos from Google Tasks." },
  microsoft: { label: "Microsoft To Do", description: "To-dos from Microsoft To Do." },
  todoist: { label: "Todoist", description: "To-dos from Todoist." },
};

const PHOTOS: { [K in PhotoKind]: { label: string; description: string } } = {
  amazonShare: { label: "Amazon shared albums", description: "Amazon Photos shared album links." },
  amazonPeople: { label: "Amazon people", description: "Amazon Photos people, with the household's cookies." },
  urls: { label: "Photo URL lists", description: "Lists of picture addresses pasted in Settings." },
  library: { label: "Photo library", description: "Uploads and Google Photos picks kept in Everydaypane." },
  bingPotd: { label: "Bing picture of the day", description: "Bing's daily picture." },
  reddit: { label: "Reddit", description: "Pictures from subreddits." },
  weatherAlbums: { label: "Weather-linked albums", description: "Albums picked by today's weather." },
  immich: { label: "Immich", description: "A household's own Immich server." },
  dropbox: { label: "Dropbox", description: "A Dropbox folder." },
  onedrive: { label: "OneDrive", description: "A OneDrive folder." },
  box: { label: "Box", description: "A Box folder." },
  flickr: { label: "Flickr", description: "Flickr albums." },
  smugmug: { label: "SmugMug", description: "A SmugMug album." },
  icloudPublished: { label: "iCloud shared albums", description: "iCloud published album links." },
};

export const widgetFlag = (type: WidgetType) => `widget.${type}`;
export const smartHomeFlag = (provider: SmartHomeProvider) => `smartHome.${provider}`;
export const musicFlag = (provider: Exclude<MediaProvider, "homeAssistant">) => `music.${provider}`;
export const tasksFlag = (provider: TasksProvider) => `tasks.${provider}`;
export const photoFlag = (kind: PhotoKind) => `photos.${kind}`;

function groupOf(type: WidgetType): string {
  return WIDGET_GROUPS.find((g) => g.types.includes(type))?.label ?? "Other widgets";
}

function entries<T extends string>(record: { [K in T]: { label: string; description: string } }): [
  T,
  { label: string; description: string },
][] {
  return Object.entries(record) as [T, { label: string; description: string }][];
}

export const FEATURE_FLAGS: FeatureFlag[] = [
  ...WIDGET_TYPES.map((type): FeatureFlag => ({
    name: widgetFlag(type),
    label: WIDGETS[type].label,
    description: WIDGETS[type].description,
    group: `Widgets · ${groupOf(type)}`,
    kind: "widget",
    default: true,
  })),
  ...entries(SMART_HOME).map(([p, d]): FeatureFlag => ({
    name: smartHomeFlag(p),
    ...d,
    group: "Smart home",
    kind: "smartHome",
    default: true,
  })),
  ...entries(MUSIC).map(([p, d]): FeatureFlag => ({ name: musicFlag(p), ...d, group: "Music", kind: "music", default: true })),
  ...entries(TASKS).map(([p, d]): FeatureFlag => ({ name: tasksFlag(p), ...d, group: "To-dos", kind: "tasks", default: true })),
  ...entries(PHOTOS).map(([k, d]): FeatureFlag => ({ name: photoFlag(k), ...d, group: "Photo sources", kind: "photos", default: true })),
];

const NAMES = new Set(FEATURE_FLAGS.map((f) => f.name));

export function isFeatureFlag(name: string): boolean {
  return NAMES.has(name);
}

/**
 * Flags from before the registry (2026-11-24's Flags tab, which nothing read yet) mapped to their registry names, so
 * a switch staff already flipped keeps meaning the same thing.
 */
export const LEGACY_FLAGS: Record<string, string[]> = {
  amazon_photos: [photoFlag("amazonShare"), photoFlag("amazonPeople")],
  home_assistant: [smartHomeFlag("homeAssistant")],
  nest: [smartHomeFlag("nest")],
  music_spotify: [musicFlag("spotify")],
  music_sonos: [musicFlag("sonos")],
  earth_map: [widgetFlag("earth")],
  radar: [widgetFlag("radar")],
  package_tracking: [widgetFlag("packages")],
};

/** Flag names that are off. Anything not listed is on. */
export type FlagsOff = ReadonlySet<string>;

const HA = smartHomeFlag("homeAssistant");

/** The flags a widget needs: its own type and, for widgets with a provider, that provider. */
export function flagsForWidget(w: Widget): string[] {
  const own = widgetFlag(w.type);
  switch (w.type) {
    case "haEntity":
      return [own, smartHomeFlag(w.provider)];
    case "media":
      return [own, w.provider === "homeAssistant" ? HA : musicFlag(w.provider)];
    case "tasks":
      return [own, tasksFlag(w.provider)];
    case "camera":
    case "presence":
      return [own, HA];
    default:
      return [own];
  }
}

export function widgetAllowed(w: Widget, off: FlagsOff): boolean {
  return flagsForWidget(w).every((f) => !off.has(f));
}

/**
 * The settings as a display (and every display feed) should see them: widgets, providers and photo sources that
 * are switched off are dropped, and the pieces of Home Assistant and Airthings that work without a widget (doorbell,
 * motion sensors, indoor alerts) are turned off with their flag. Never saved: the household panel keeps editing the
 * full document, so turning a flag back on brings everything back as it was.
 */
export function applyFlags(config: DashboardConfig, off: FlagsOff): DashboardConfig {
  if (off.size === 0) return config;
  const sources = config.integrations.photos.sources.filter((s) => !off.has(photoFlag(s.kind)));
  const kept = new Set(sources.map((s) => s.id));
  const haOff = off.has(HA);
  const next: DashboardConfig = {
    ...config,
    views: config.views.map((v) => ({
      ...v,
      widgets: v.widgets.flatMap((w) => {
        if (!widgetAllowed(w, off)) return [];
        if (w.type !== "photos" || w.sourceIds.length === 0) return [w];
        // A photos widget whose picked sources are all off goes too, rather than falling back to "every source".
        const ids = w.sourceIds.filter((id) => kept.has(id));
        return ids.length > 0 ? [{ ...w, sourceIds: ids }] : [];
      }),
    })),
    screenSaver: {
      ...config.screenSaver,
      photoSourceIds: config.screenSaver.photoSourceIds.filter((id) => kept.has(id)),
      motionEntityIds: haOff ? [] : config.screenSaver.motionEntityIds,
    },
    integrations: {
      ...config.integrations,
      photos: { ...config.integrations.photos, sources },
      homeAssistant: haOff
        ? {
            ...config.integrations.homeAssistant,
            doorbell: { ...config.integrations.homeAssistant.doorbell, entityId: "", cameraEntityId: "" },
          }
        : config.integrations.homeAssistant,
      smartHome: off.has(widgetFlag("airthings"))
        ? {
            ...config.integrations.smartHome,
            airthings: { ...config.integrations.smartHome.airthings, alertRadon: false, alertCo2: false },
          }
        : config.integrations.smartHome,
    },
  };
  return next;
}

/**
 * Settings cards that only matter for some flags: a card hides once every flag it lists is off. Keyed by the card's
 * `#settings/<id>` anchor. Cards not listed always show.
 */
export const SETTINGS_FLAGS: Record<string, string[]> = {
  garbage: [widgetFlag("garbage")],
  commute: [widgetFlag("commute")],
  chores: [widgetFlag("chores")],
  sports: [widgetFlag("sports")],
  school: [widgetFlag("school")],
  tasks: [widgetFlag("tasks")],
  music: [widgetFlag("media")],
  ha: [smartHomeFlag("homeAssistant")],
  "smart-home": (["nest", "ecobee", "smartthings", "govee", "hue", "lifx"] as const).map(smartHomeFlag),
  "weather-stations": [widgetFlag("tempest"), widgetFlag("weatherUnderground")],
  "indoor-air": [widgetFlag("airthings")],
  sprinklers: [widgetFlag("rachio")],
  menus: [widgetFlag("menus")],
  unifi: [widgetFlag("unifi")],
  ecoflow: [widgetFlag("ecoflow")],
  ynab: [widgetFlag("ynab")],
  fitbit: [widgetFlag("fitbit")],
  oura: [widgetFlag("oura")],
  "gmail-unread": [widgetFlag("emailCount")],
  slack: [widgetFlag("slack")],
  trello: [widgetFlag("trello")],
};

export function settingsSectionOn(section: string, on: (name: string) => boolean): boolean {
  const names = SETTINGS_FLAGS[section];
  return !names || names.some(on);
}
