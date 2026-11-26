import { musicFlag, photoFlag, smartHomeFlag, tasksFlag, widgetFlag } from "./featureFlags";

// Everydaypane's own API keys for integrations (Melvin, 2026-11-26: "add all these api settings to admin system, i
// want an indication that they're still missing. also if there's a widget that needs keys, don't show it in
// /household unless it's set"). These live in Vercel's environment variables, one set for every household, so the
// admin's System tab shows each one as set or missing (never its value) and the household panel stops offering what
// a missing key would leave broken. Keys a household pastes for itself (Govee, LIFX, UniFi, Airthings, EcoFlow,
// Rachio, Blue Riiot, 17TRACK, YNAB's token) are not here: those widgets work without anything from us.
// Kept free of server code: the household panel, the server and the tests all import it.

/** One variable name, or several where any one of them will do. */
type Need = string | readonly string[];

export interface PlatformKey {
  id: string;
  label: string;
  group: string;
  /** Every entry must be set; an inner list is satisfied by any one of its names. */
  needs: readonly Need[];
  /** What it switches on, in a few words. */
  powers: string;
  /** Repo docs page with the setup steps. */
  docs?: string;
  /**
   * Household-panel flag names (`widget.*`, `smartHome.*`, `music.*`, `tasks.*`, `photos.*`) that can't work without
   * this key. A name listed under several keys stays available while any one of them is set.
   */
  unlocks: readonly string[];
}

export const PLATFORM_KEYS: readonly PlatformKey[] = [
  {
    id: "google",
    label: "Google OAuth",
    group: "Calendars & Tasks",
    needs: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    powers: "Google Calendar, Google Tasks, Google Photos picks and Gmail unread",
    docs: "docs/google-tasks.md",
    unlocks: [widgetFlag("emailCount"), widgetFlag("tasks"), tasksFlag("google")],
  },
  {
    id: "microsoft",
    label: "Microsoft 365",
    group: "Calendars & Tasks",
    needs: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    powers: "Microsoft 365 calendars, Microsoft To Do and OneDrive photos",
    unlocks: [widgetFlag("tasks"), tasksFlag("microsoft"), photoFlag("onedrive")],
  },
  {
    id: "todoist",
    label: "Todoist",
    group: "Calendars & Tasks",
    needs: ["TODOIST_CLIENT_ID", "TODOIST_CLIENT_SECRET"],
    powers: "To-dos from Todoist",
    unlocks: [widgetFlag("tasks"), tasksFlag("todoist")],
  },
  {
    id: "googleMaps",
    label: "Google Maps Platform",
    group: "Maps & Travel",
    needs: ["GOOGLE_MAPS_API_KEY"],
    powers: "Gas prices around home (Places API)",
    docs: "docs/gas-prices.md",
    unlocks: [widgetFlag("gasPrices")],
  },
  {
    id: "tomtom",
    label: "TomTom",
    group: "Maps & Travel",
    needs: ["TOMTOM_API_KEY"],
    powers: "Commute times with live traffic",
    docs: "docs/commute.md",
    unlocks: [widgetFlag("commute")],
  },
  {
    id: "translink",
    label: "TransLink",
    group: "Maps & Travel",
    needs: ["TRANSLINK_API_KEY"],
    powers: "TransLink departures (other transit agencies need no key)",
    docs: "docs/translink.md",
    unlocks: [],
  },
  {
    id: "ontario511",
    label: "Ontario 511",
    group: "Alerts",
    needs: ["ONTARIO_511_KEY"],
    powers: "Ontario road events on the alert strip",
    unlocks: [],
  },
  {
    id: "alberta511",
    label: "511 Alberta",
    group: "Alerts",
    needs: ["ALBERTA_511_KEY"],
    powers: "Alberta road events on the alert strip",
    unlocks: [],
  },
  {
    id: "nest",
    label: "Google Nest Device Access",
    group: "Smart Home",
    needs: ["NEST_PROJECT_ID", ["NEST_CLIENT_ID", "GOOGLE_CLIENT_ID"], ["NEST_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET"]],
    powers: "Nest thermostats and cameras (uses the Google client when NEST_CLIENT_* is empty)",
    docs: "docs/nest.md",
    unlocks: [smartHomeFlag("nest")],
  },
  {
    id: "ecobee",
    label: "ecobee",
    group: "Smart Home",
    needs: ["ECOBEE_CLIENT_ID", "ECOBEE_CLIENT_SECRET"],
    powers: "ecobee thermostats",
    docs: "docs/ecobee.md",
    unlocks: [smartHomeFlag("ecobee")],
  },
  {
    id: "smartthings",
    label: "SmartThings",
    group: "Smart Home",
    needs: ["SMARTTHINGS_CLIENT_ID", "SMARTTHINGS_CLIENT_SECRET"],
    powers: "SmartThings devices and Samsung washers and dryers",
    docs: "docs/smartthings.md",
    unlocks: [smartHomeFlag("smartthings")],
  },
  {
    id: "hue",
    label: "Philips Hue",
    group: "Smart Home",
    needs: ["HUE_CLIENT_ID", "HUE_CLIENT_SECRET"],
    powers: "Hue lights through the Remote API",
    docs: "docs/hue.md",
    unlocks: [smartHomeFlag("hue")],
  },
  {
    id: "spotify",
    label: "Spotify",
    group: "Music",
    needs: ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"],
    powers: "The Music widget signed in to Spotify directly",
    docs: "docs/music.md",
    unlocks: [musicFlag("spotify")],
  },
  {
    id: "sonos",
    label: "Sonos",
    group: "Music",
    needs: ["SONOS_CLIENT_ID", "SONOS_CLIENT_SECRET"],
    powers: "The Music widget signed in to Sonos directly",
    docs: "docs/music.md",
    unlocks: [musicFlag("sonos")],
  },
  {
    id: "blob",
    label: "Vercel Blob",
    group: "Photos",
    needs: [["BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID"]],
    powers: "Photo library uploads, Google Photos picks, family and countdown photos",
    docs: "docs/google-photos.md",
    unlocks: [photoFlag("library")],
  },
  {
    id: "dropbox",
    label: "Dropbox",
    group: "Photos",
    needs: ["DROPBOX_CLIENT_ID", "DROPBOX_CLIENT_SECRET"],
    powers: "Dropbox photo folders",
    unlocks: [photoFlag("dropbox")],
  },
  {
    id: "box",
    label: "Box",
    group: "Photos",
    needs: ["BOX_CLIENT_ID", "BOX_CLIENT_SECRET"],
    powers: "Box photo folders",
    unlocks: [photoFlag("box")],
  },
  {
    id: "flickr",
    label: "Flickr",
    group: "Photos",
    needs: ["FLICKR_API_KEY"],
    powers: "Flickr albums",
    unlocks: [photoFlag("flickr")],
  },
  {
    id: "smugmug",
    label: "SmugMug",
    group: "Photos",
    needs: ["SMUGMUG_API_KEY", "SMUGMUG_API_SECRET"],
    powers: "SmugMug albums",
    unlocks: [photoFlag("smugmug")],
  },
  {
    id: "oura",
    label: "Oura",
    group: "Health",
    needs: ["OURA_CLIENT_ID", "OURA_CLIENT_SECRET"],
    powers: "Oura sleep, readiness and activity",
    docs: "docs/oura.md",
    unlocks: [widgetFlag("oura")],
  },
  {
    id: "fitbit",
    label: "Fitbit",
    group: "Health",
    needs: ["FITBIT_CLIENT_ID", "FITBIT_CLIENT_SECRET"],
    powers: "Fitbit steps, sleep and heart rate",
    docs: "docs/content-widgets.md",
    unlocks: [widgetFlag("fitbit")],
  },
  {
    id: "slack",
    label: "Slack",
    group: "Content & Finance",
    needs: ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"],
    powers: "Latest messages from Slack channels",
    docs: "docs/content-widgets.md",
    unlocks: [widgetFlag("slack")],
  },
  {
    id: "trello",
    label: "Trello",
    group: "Content & Finance",
    needs: ["TRELLO_API_KEY"],
    powers: "Trello boards",
    docs: "docs/content-widgets.md",
    unlocks: [widgetFlag("trello")],
  },
  {
    id: "ynabOauth",
    label: "YNAB OAuth",
    group: "Content & Finance",
    needs: ["YNAB_CLIENT_ID", "YNAB_CLIENT_SECRET"],
    powers: "Connect YNAB with a button (a household can still paste its own token without it)",
    docs: "docs/content-widgets.md",
    unlocks: [],
  },
  {
    id: "finnhub",
    label: "Finnhub",
    group: "Content & Finance",
    needs: ["FINNHUB_API_KEY"],
    powers: "Stock quotes from Finnhub (Yahoo is used without it)",
    docs: "docs/content-widgets.md",
    unlocks: [],
  },
  {
    id: "gnews",
    label: "GNews",
    group: "Content & Finance",
    needs: ["GNEWS_API_KEY"],
    powers: "GNews headlines in the News widget (RSS presets work without it)",
    docs: "docs/content-widgets.md",
    unlocks: [],
  },
  {
    id: "aviationstack",
    label: "Aviationstack",
    group: "Content & Finance",
    needs: ["AIRPORT_API_KEY"],
    powers: "Airport delays (METAR works without it)",
    docs: "docs/content-widgets.md",
    unlocks: [],
  },
  {
    id: "wunderground",
    label: "Weather Underground",
    group: "Weather",
    needs: ["WU_API_KEY"],
    powers: "Default key for Weather Underground stations (households may paste their own)",
    docs: "docs/weather-underground.md",
    unlocks: [],
  },
];

export type KeyState = "set" | "partly" | "missing";

const names = (n: Need): readonly string[] => (typeof n === "string" ? [n] : n);

/** Every variable name a key reads, for showing in the admin. */
export function keyVarNames(key: PlatformKey): string[] {
  return key.needs.map((n) => names(n).join(" or "));
}

/** Set when every need is met, partly when some variable is set, else missing. `has` reports one variable. */
export function keyState(key: PlatformKey, has: (name: string) => boolean): KeyState {
  if (key.needs.every((n) => names(n).some(has))) return "set";
  return key.needs.some((n) => names(n).some(has)) ? "partly" : "missing";
}

/**
 * Household-panel flag names to hide because every key that unlocks them is missing. Only offering is affected: a
 * widget already on a wall keeps drawing and says it isn't set up, as before.
 */
export function unconfiguredFlags(ready: ReadonlySet<string>): string[] {
  const any = new Map<string, boolean>();
  for (const key of PLATFORM_KEYS) {
    for (const name of key.unlocks) any.set(name, (any.get(name) ?? false) || ready.has(key.id));
  }
  return [...any].filter(([, ok]) => !ok).map(([name]) => name);
}
