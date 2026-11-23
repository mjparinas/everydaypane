import { z } from "zod";

import { EARTH_OVERLAYS, EARTH_ZOOMS } from "../earth";
import { FERRY_ROUTES } from "../ferries";
import { MEAL_SLOTS } from "../meals";
import { SCREEN_SAVER_OFF } from "../screenSaver";
import { LEAGUE_IDS, MAX_TEAMS } from "../sports";
import { PERIODS } from "./periods";

// The whole dashboard setup, as the admin panel edits it and every display reads it. One JSON document, validated
// here on every save (src/server/config.ts), versioned so displays know when to reload. Secrets (tokens, cookies,
// passwords) never live here: they are in the secrets table (src/server/secrets.ts) and stay on the server.
//
// The display page imports only the types from this file (`import type`), so zod stays out of its bundle.

const id = z.string().min(1).max(64);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "A colour like #1a2b3c");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "A time like 07:30");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date like 2026-12-25");
const timeZone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, "An IANA time zone like America/Vancouver");

export const paletteSchema = z.object({
  background: hex,
  backgroundTo: hex, // the second stop of the background gradient (same as background for a flat colour)
  surface: hex,
  text: hex,
  muted: hex,
  accent: hex,
  danger: hex,
});
export type Palette = z.infer<typeof paletteSchema>;

export const themeSchema = z.object({
  id,
  name: z.string().min(1).max(40),
  day: paletteSchema,
  night: paletteSchema,
  font: z.enum(["inter", "manrope", "space-grotesk", "system"]),
  radius: z.number().int().min(0).max(40),
  surfaceOpacity: z.number().min(0).max(1),
  // Frosted glass behind widgets. Pretty, but backdrop blur costs GPU time on a low-power display, so it's off by default.
  glass: z.boolean(),
});
export type Theme = z.infer<typeof themeSchema>;

// ---- Widgets ----

const base = {
  id,
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
  title: z.string().max(60).optional(),
  // Melvin, 2026-11-22: each widget can drop its panel or set its own opacity; the theme's surfaceOpacity is the default.
  showBackground: z.boolean().default(true),
  backgroundOpacity: z.number().min(0).max(1).optional(),
};

export const countdownEventSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  date: isoDate,
  emoji: z.string().max(8).default(""),
  kind: z.enum(["holiday", "birthday", "event"]),
  // Yearly events (birthdays, Christmas) roll over to next year once the day has passed.
  yearly: z.boolean(),
});
export type CountdownEvent = z.infer<typeof countdownEventSchema>;

// A kitchen timer's button: a name ("Eggs") and a length. Up to a day.
export const timerPresetSchema = z.object({
  id,
  label: z.string().trim().max(30),
  emoji: z.string().max(8),
  seconds: z.number().int().min(5).max(86_400),
});
export type TimerPreset = z.infer<typeof timerPresetSchema>;

// How a timer or pomodoro tells you it's done (Melvin, 2026-11-21: "visual and sound alerts"). The widget always
// flashes; the screen-wide notice and the beeps can each be switched off, and both stop by themselves after a while.
const alertFields = {
  sound: z.boolean(),
  fullScreen: z.boolean(),
  ringSeconds: z.number().int().min(5).max(600),
};

export const haControlSchema = z.enum(["auto", "toggle", "light", "sensor", "climate", "cover", "lock", "button"]);
export type HaControl = z.infer<typeof haControlSchema>;

export const widgetSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("clock"),
    // Clocks sit over photos with no panel by default (same as before the per-widget background setting).
    showBackground: z.boolean().default(false),
    timeZone,
    label: z.string().max(40),
    showSeconds: z.boolean(),
    style: z.enum(["digital", "analog"]),
  }),
  z.object({
    ...base,
    type: z.literal("date"),
    showBackground: z.boolean().default(false),
    timeZone,
    showYear: z.boolean(),
  }),
  // Today's sunrise and sunset at the dashboard's location. It shares the weather feed, which already includes both.
  // showEmoji covers the sun icons and the daylight line; showDaylight hides the hours of daylight (Melvin, 2026-11-22).
  // The old sunTimes-only `transparent` flag became showBackground on every widget (upgrade in src/server/config.ts).
  z.object({
    ...base,
    type: z.literal("sunTimes"),
    showEmoji: z.boolean().default(true),
    showDaylight: z.boolean().default(true),
  }),
  z.object({
    ...base,
    type: z.literal("weather"),
    days: z.number().int().min(0).max(7),
    showCurrent: z.boolean(),
    showHourly: z.boolean(),
    // UV index and pollen from Open-Meteo (Melvin, 2026-11-22). On by default for new widgets; older documents keep
    // the fields via zod defaults so the forecast looks the same until someone switches them on.
    showUv: z.boolean().default(true),
    showPollen: z.boolean().default(true),
  }),
  z.object({ ...base, type: z.literal("airQuality"), scale: z.enum(["aqhi", "usAqi"]) }),
  z.object({
    ...base,
    type: z.literal("wifiQr"),
    ssid: z.string().min(1).max(32),
    // The WiFi password is shown to anyone standing at the display (that's the point), so it lives in the config.
    password: z.string().max(63),
    encryption: z.enum(["WPA", "WEP", "nopass"]),
    hidden: z.boolean(),
    showPassword: z.boolean(),
  }),
  // Phone edit QR (Melvin, 2026-11-22): encodes `/d/<this display's token>/edit/` for meals, shopping and messages.
  z.object({ ...base, type: z.literal("editQr") }),
  z.object({
    ...base,
    type: z.literal("countdown"),
    events: z.array(countdownEventSchema).max(50),
    count: z.number().int().min(1).max(12),
  }),
  z.object({ ...base, type: z.literal("agenda"), range: z.enum(["today", "upcoming"]), days: z.number().int().min(1).max(14) }),
  z.object({
    ...base,
    type: z.literal("calendarMonth"),
    weekStartsOn: z.union([z.literal(0), z.literal(1)]),
    // The "November 2026" line above the grid (Melvin, 2026-11-19: a toggle to hide it). Shown unless switched off, so
    // month widgets saved before the toggle existed look the same.
    showTitle: z.boolean().default(true),
    // How many weeks to show, starting with this one (Melvin, 2026-11-21: "minimum 1, max is 6"). Left out, the widget
    // shows the whole month as it always has, so month widgets saved before this setting look the same.
    weeks: z.number().int().min(1).max(6).optional(),
    // Saturday and Sunday columns (Melvin, 2026-11-21: "allow calendar to hide or show weekends"). Shown by default.
    showWeekends: z.boolean().default(true),
    // Wrap (and shrink if needed) so event titles are not ellipsis-truncated. On by default (Melvin, 2026-11-22).
    fitTitles: z.boolean().default(true),
    // When the grid has more week rows than this, size rows as if only this many fit and scroll the rest
    // (Melvin, 2026-11-22: touch scroll, default 3 weeks).
    scrollWeeks: z.number().int().min(1).max(6).default(3),
  }),
  z.object({ ...base, type: z.literal("garbage"), weeks: z.number().int().min(1).max(8) }),
  z.object({
    ...base,
    type: z.literal("photos"),
    sourceIds: z.array(id).max(20),
    intervalSeconds: z.number().int().min(5).max(3600),
    fit: z.enum(["cover", "contain"]),
    showCaption: z.boolean(),
  }),
  z.object({ ...base, type: z.literal("haEntity"), entityId: z.string().max(255), control: haControlSchema }),
  z.object({ ...base, type: z.literal("note"), text: z.string().max(2000), size: z.enum(["s", "m", "l", "xl"]) }),
  // The family message board: notes anyone in the family posts from their phone (stored in the messages table).
  z.object({ ...base, type: z.literal("messages"), count: z.number().int().min(1).max(20) }),
  // The meal plan (stored in the meals table): today's meals, or the days ahead, showing the chosen meals.
  z.object({
    ...base,
    type: z.literal("meals"),
    days: z.number().int().min(1).max(7),
    slots: z
      .array(z.enum(MEAL_SLOTS))
      .min(1, "Pick at least one meal")
      .max(3)
      .refine((s) => new Set(s).size === s.length, "Each meal once"),
  }),
  // Emergency and severe weather alerts for the area (the full-screen takeover is configured in config.alerts).
  z.object({ ...base, type: z.literal("alerts"), showAllClear: z.boolean() }),
  // Google Tasks (Melvin, 2026-11-17): the open tasks of some lists (none picked means every list switched on under
  // Settings), which anyone at the wall can tick off when `allowCheck` is on.
  z.object({
    ...base,
    type: z.literal("tasks"),
    listIds: z.array(z.string().max(255)).max(20),
    count: z.number().int().min(1).max(30),
    showDue: z.boolean(),
    allowCheck: z.boolean(),
  }),
  // TransLink departures (Melvin, 2026-11-19): the next buses from a few stops, live from TransLink's GTFS-realtime
  // feed (src/server/translink.ts). Stops are picked in the widget's settings and kept with their stop number and
  // name, so the wall can label them without asking TransLink. `routes` (route numbers like "502") narrows the list,
  // none meaning every route; departures sooner than `walkMinutes` are left out, since nobody can catch them.
  z.object({
    ...base,
    type: z.literal("transit"),
    stops: z
      .array(z.object({ id: z.string().min(1).max(40), code: z.string().max(20), name: z.string().max(120) }))
      .max(6)
      .refine((s) => new Set(s.map((x) => x.id)).size === s.length, "Each stop once"),
    routes: z.array(z.string().trim().min(1).max(12)).max(30),
    count: z.number().int().min(1).max(12),
    walkMinutes: z.number().int().min(0).max(60),
  }),
  // A UniFi Protect camera, through Home Assistant's UniFi Protect integration (camera.* entity).
  z.object({ ...base, type: z.literal("camera"), entityId: z.string().max(255), refreshSeconds: z.number().int().min(2).max(600) }),
  // Music (Melvin, 2026-11-17: Sonos and Spotify controls): a media_player entity through Home Assistant's Sonos or
  // Spotify integration. Shows what's playing, with play/pause, skip, volume and the player's sources (Sonos
  // favourites, or the Spotify Connect speakers to play on).
  // Direct Spotify and Sonos (Melvin, 2026-11-18: "build along side it"): `provider` picks Home Assistant (entityId),
  // the connected Spotify account (whatever it is playing on), or one Sonos speaker (playerId) and the group it is in.
  // Both default so a widget saved before this existed still loads as a Home Assistant one.
  z.object({
    ...base,
    type: z.literal("media"),
    provider: z.enum(["homeAssistant", "spotify", "sonos"]).default("homeAssistant"),
    entityId: z.string().max(255),
    playerId: z.string().max(120).default(""),
    showArt: z.boolean(),
    showVolume: z.boolean(),
    showSources: z.boolean(),
  }),
  // The kids' chore chart (Melvin, 2026-11-21): today's chores for the people under Settings › Chores (none picked means
  // everyone), ticked off with a tap when `allowCheck` is on, with each person's stars this week.
  z.object({
    ...base,
    type: z.literal("chores"),
    personIds: z.array(id).max(8),
    showStars: z.boolean(),
    allowCheck: z.boolean(),
  }),
  // Commute time (Melvin, 2026-11-19): live-traffic drive times from home to the places under Settings › Commute
  // (none picked means all of them).
  z.object({
    ...base,
    type: z.literal("commute"),
    destinationIds: z.array(id).max(6),
    showDistance: z.boolean(),
    showArrival: z.boolean(),
  }),
  // Rain radar (Melvin, 2026-11-21): Environment Canada's radar around home, animated over the past hour or so and on
  // into its short-term forecast (src/server/radar.ts). Zoom 6 is most of southern B.C., 8 the Lower Mainland, 10 the
  // Township.
  z.object({
    ...base,
    type: z.literal("radar"),
    precip: z.enum(["rain", "snow"]),
    zoom: z.number().int().min(6).max(10),
    pastMinutes: z.number().int().min(30).max(180),
    forecastMinutes: z.number().int().min(0).max(180),
    animate: z.boolean(),
  }),
  // Kitchen timers (Melvin, 2026-11-21): tap a button on the wall to start one; several can run at once.
  z.object({ ...base, type: z.literal("timer"), presets: z.array(timerPresetSchema).max(12), ...alertFields }),
  // A pomodoro (Melvin, 2026-11-21: "a separate pomodoro"): focus rounds and breaks, a long break after the last round.
  z.object({
    ...base,
    type: z.literal("pomodoro"),
    workMinutes: z.number().int().min(1).max(120),
    shortBreakMinutes: z.number().int().min(1).max(60),
    longBreakMinutes: z.number().int().min(1).max(90),
    rounds: z.number().int().min(1).max(12),
    autoStart: z.boolean(),
    ...alertFields,
  }),
  // BC Ferries (Melvin, 2026-11-21): the next sailings and how full they are, for up to four routes (src/server/ferries.ts).
  z.object({
    ...base,
    type: z.literal("ferries"),
    routes: z.array(z.enum(FERRY_ROUTES)).min(1).max(4),
    count: z.number().int().min(1).max(8),
    showVessel: z.boolean(),
  }),
  // Sports scores (Melvin, 2026-11-21): live scores, the last result and the next game of the teams followed under
  // Settings › Sports (none picked means all of them).
  z.object({
    ...base,
    type: z.literal("sports"),
    teamIds: z.array(id).max(MAX_TEAMS),
    showLast: z.boolean(),
  }),
  // The earth wind map (Melvin, 2026-11-21): earth.nullschool.net's animated wind and weather, centred on a place
  // (src/lib/earth.ts). `place` is only the name the admin panel shows.
  z.object({
    ...base,
    type: z.literal("earth"),
    place: z.string().max(80),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    zoom: z.enum(EARTH_ZOOMS),
    overlay: z.enum(EARTH_OVERLAYS),
    showPlace: z.boolean(),
    animate: z.boolean(),
  }),
  // Shopping list (Melvin, 2026-11-22): items in the shopping table, added from phones, ticked on the wall when
  // allowCheck is on.
  z.object({
    ...base,
    type: z.literal("shopping"),
    count: z.number().int().min(1).max(40),
    allowCheck: z.boolean(),
    showDone: z.boolean(),
  }),
  // Who's home (Melvin, 2026-11-22): Home Assistant person / device_tracker / presence entities, read-only.
  z.object({
    ...base,
    type: z.literal("presence"),
    entities: z
      .array(z.object({ entityId: z.string().max(255), label: z.string().max(40) }))
      .max(12)
      .refine((xs) => new Set(xs.map((x) => x.entityId)).size === xs.length, "Each person once"),
  }),
  // School / snow-day status (Melvin, 2026-11-22): scrapes the district site banner (Langley SD35 by default).
  z.object({
    ...base,
    type: z.literal("school"),
    // School name fragments to match in a closure notice (empty = any district-wide alert).
    schools: z.array(z.string().trim().min(1).max(80)).max(12),
  }),
  // Kitchen whiteboard (Melvin, 2026-11-22): finger draw with a few colours and an eraser; one shared doodle on
  // every display (src/server/whiteboard.ts). Wider tiles show more colours. Hold Clear to wipe.
  z.object({ ...base, type: z.literal("whiteboard") }),
]);
export type Widget = z.infer<typeof widgetSchema>;
export type WidgetType = Widget["type"];
export type WidgetOf<T extends WidgetType> = Extract<Widget, { type: T }>;

export const viewSchema = z.object({
  id,
  name: z.string().min(1).max(40),
  cols: z.number().int().min(1).max(24),
  rows: z.number().int().min(1).max(24),
  gap: z.number().int().min(0).max(48),
  padding: z.number().int().min(0).max(96),
  // Space inside each tile between the panel edge and the content (Melvin, 2026-11-22). Photos, cameras and
  // radar keep padding 0 in CSS so the picture still fills the cell.
  tilePadding: z.number().int().min(0).max(48).default(16),
  themeId: id.nullable(), // null: the dashboard's theme
  widgets: z.array(widgetSchema).max(60),
});
export type View = z.infer<typeof viewSchema>;

// ---- The day ----

export { PERIODS, type Period } from "./periods";

/** Fixed clock time, or today's sunrise / sunset at the dashboard location (from the weather feed). */
export const periodStartSchema = z.union([hhmm, z.literal("sunrise"), z.literal("sunset")]);
export type PeriodStart = z.infer<typeof periodStartSchema>;

export const periodSchema = z.object({
  start: periodStartSchema,
  viewId: id,
  mode: z.enum(["day", "night"]),
  // Night mode can also dim the whole screen (0 = off, 0.8 = very dim) for a display in a bedroom or hallway.
  dim: z.number().min(0).max(0.9),
});

export const photoSourceSchema = z.discriminatedUnion("kind", [
  z.object({ id, kind: z.literal("amazonShare"), name: z.string().max(60), url: z.url() }),
  z.object({ id, kind: z.literal("amazonPeople"), name: z.string().max(60), personIds: z.array(z.string().max(128)).max(20) }),
  z.object({ id, kind: z.literal("urls"), name: z.string().max(60), urls: z.array(z.url()).max(500) }),
  // Photos kept by Everydaypane itself: uploaded from the admin panel or picked in Google Photos (src/server/library.ts).
  z.object({ id, kind: z.literal("library"), name: z.string().max(60) }),
]);
export type PhotoSource = z.infer<typeof photoSourceSchema>;

// A place for the commute widget, found from its address in the admin panel (src/server/commute.ts). The address is
// kept as a label for the admin panel only; displays get the name and the drive time.
const placeSchema = z.object({
  label: z.string().max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const commuteDestinationSchema = placeSchema.extend({
  id,
  name: z.string().trim().min(1).max(40),
  emoji: z.string().max(8),
  // When someone needs to be there (school at 08:30); the widget then says when to leave. Empty for none.
  arriveBy: z.union([hhmm, z.literal("")]),
});
export type CommuteDestination = z.infer<typeof commuteDestinationSchema>;

export const screenSaverSchema = z.object({
  idle: z.boolean(),
  minutes: z.number().int().min(1).max(240),
  shows: z.enum(["photos", "dark"]),
  // The albums the photo saver shows (none picked means all of them).
  photoSourceIds: z.array(id).max(20),
  showClock: z.boolean(),
  night: z.boolean(),
  nightStart: hhmm,
  nightEnd: hhmm,
  // binary_sensor.* motion or occupancy sensors: while one is on, the screen counts as in use.
  motionEntityIds: z.array(z.string().max(255)).max(5),
});
export type ScreenSaver = z.infer<typeof screenSaverSchema>;

// The chore chart (Melvin, 2026-11-21): the people who do chores, and recurring chores that are shared by everyone on
// them or rotate between them by day or by week (src/lib/chores.ts). Who ticked what off lives in the chores_done table.
export const chorePersonSchema = z.object({
  id,
  name: z.string().trim().min(1).max(30),
  emoji: z.string().max(8),
  color: hex,
  // Stars to aim for each week (0 for no goal); the widget draws a bar towards it.
  goal: z.number().int().min(0).max(500),
});
export type ChorePerson = z.infer<typeof chorePersonSchema>;

export const choreSchema = z.object({
  id,
  name: z.string().trim().min(1).max(40),
  emoji: z.string().max(8),
  stars: z.number().int().min(1).max(5),
  // Weekdays it's due, 0 = Sunday.
  days: z
    .array(z.number().int().min(0).max(6))
    .min(1, "Pick at least one day")
    .max(7)
    .refine((d) => new Set(d).size === d.length, "Each day once"),
  personIds: z.array(id).min(1, "Pick who does it").max(8),
  // "none": everyone picked does it; "day": one of them each time it's due, in turn; "week": one of them all week.
  rotate: z.enum(["none", "day", "week"]),
});
export type Chore = z.infer<typeof choreSchema>;

// A team the sports widget follows, picked in the admin panel from ESPN's team list for its league.
export const sportsTeamSchema = z.object({
  id,
  league: z.enum(LEAGUE_IDS),
  teamId: z.string().regex(/^[0-9]{1,8}$/, "An ESPN team id"),
  name: z.string().trim().min(1).max(60),
  abbr: z.string().trim().min(1).max(8),
  color: hex,
});
export type SportsTeam = z.infer<typeof sportsTeamSchema>;

export const configSchema = z
  .object({
    name: z.string().min(1).max(60),
    location: z.object({
      name: z.string().max(60),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      timeZone,
    }),
    units: z.enum(["metric", "imperial"]),
    hour12: z.boolean(),
    themeId: id,
    themes: z.array(themeSchema).min(1).max(30),
    views: z.array(viewSchema).min(1).max(30),
    // Emergency alerts (Melvin, 2026-11-17): Alert Ready (NAAD), Environment Canada weather alerts, DriveBC road events,
    // Earthquakes Canada and BC Hydro outages, for the area around location. Alerts at or above `banner` show as a red strip across the
    // top of every screen until someone taps to dismiss it (Melvin, 2026-11-17: a strip, not a full-screen takeover);
    // the alerts widget lists them all.
    alerts: z.object({
      enabled: z.boolean(),
      // BC Hydro power outages (Melvin, 2026-11-19) default on, so a document saved before they existed still loads.
      sources: z.object({
        alertReady: z.boolean(),
        weather: z.boolean(),
        roads: z.boolean(),
        earthquakes: z.boolean(),
        power: z.boolean().default(true),
      }),
      banner: z.enum(["extreme", "severe", "moderate", "minor", "never"]),
      radiusKm: z.number().int().min(10).max(500),
      minMagnitude: z.number().min(2).max(9),
      // Power outages count when their area covers the home or is within this many km of it.
      powerKm: z.number().int().min(0).max(50).default(5),
      // Email ADMIN_EMAILS and FAMILY_EMAILS when a new strip-worthy alert arrives (Melvin, 2026-11-22). Off by default.
      notifyEmail: z.boolean().default(false),
    }),
    // School status (Melvin, 2026-11-22): which district site to read for snow-day / closure banners.
    school: z
      .object({
        districtName: z.string().trim().max(80).default("Langley School District"),
        // Public https page that shows a closure banner when schools are closed or delayed.
        statusUrl: z.string().trim().max(300).default("https://www.sd35.bc.ca/"),
      })
      .default({ districtName: "Langley School District", statusUrl: "https://www.sd35.bc.ca/" }),
    // Defaults to none, so a document saved before the chore chart existed still loads.
    chores: z.object({ people: z.array(chorePersonSchema).max(8), items: z.array(choreSchema).max(40) }).default({ people: [], items: [] }),
    // Burn-in protection: the whole layout drifts a few pixels every few minutes so static edges never sit on the same
    // pixels for hours, and night periods can dim the screen (periodSchema.dim).
    burnIn: z.object({ shift: z.boolean(), maxPixels: z.number().int().min(1).max(24), minutes: z.number().int().min(1).max(60) }),
    // Screen saver (Melvin, 2026-11-21): after `minutes` with no touch (or motion, from Home Assistant motion
    // sensors), the display shows only photos or goes dark; during the night window it goes dark, and a touch or
    // motion wakes it for `minutes`. Separate from the schedule's dimming, which still applies while it is awake.
    // Off by default, so a document saved before it existed still loads and behaves the same.
    screenSaver: screenSaverSchema.default(() => ({ ...SCREEN_SAVER_OFF, photoSourceIds: [], motionEntityIds: [] })),
    // Each period starts at a fixed time, sunrise or sunset, and runs until the next one starts. The overnight
    // period's key is still `night` (Melvin, 2026-11-22: renamed in the admin only).
    schedule: z.object({
      enabled: z.boolean(),
      morning: periodSchema,
      afternoon: periodSchema,
      evening: periodSchema,
      night: periodSchema,
    }),
    integrations: z.object({
      google: z.object({
        calendars: z.array(z.object({ id: z.string().max(255), name: z.string().max(120), color: hex, enabled: z.boolean() })).max(50),
      }),
      // The Google Tasks lists of the connected account that widgets may show (src/server/googleTasks.ts). Defaults to
      // none, so a document saved before Tasks existed still loads.
      tasks: z
        .object({ lists: z.array(z.object({ id: z.string().max(255), name: z.string().max(120), enabled: z.boolean() })).max(50) })
        .default({ lists: [] }),
      // Calendar links (iCal), shown with Google's events. Their addresses are stored secrets (src/server/ical.ts).
      icals: z
        .array(
          z.object({ id: z.string().regex(/^[a-z0-9]{6,20}$/), name: z.string().trim().min(1).max(60), color: hex, enabled: z.boolean() }),
        )
        .max(20),
      garbage: z.object({
        projectId: z.string().max(20),
        districtId: z.string().max(20),
        zoneId: z.string().max(200),
        zoneLabel: z.string().max(80),
      }),
      photos: z.object({ sources: z.array(photoSourceSchema).max(20) }),
      // Commute time (Melvin, 2026-11-19): from home to up to six places, by car with live traffic (TomTom). Six keeps
      // a five-minute refresh inside TomTom's free 2,500 requests a day. Defaults so older documents still load.
      commute: z
        .object({ home: placeSchema.nullable(), destinations: z.array(commuteDestinationSchema).max(6) })
        .default({ home: null, destinations: [] }),
      // Sports scores (Melvin, 2026-11-21): the teams to follow, from any of the leagues in src/lib/sports.ts. Defaults
      // so older documents still load.
      sports: z.object({ teams: z.array(sportsTeamSchema).max(MAX_TEAMS) }).default({ teams: [] }),
      homeAssistant: z.object({
        url: z.union([z.url(), z.literal("")]),
        // Doorbell pop-up: when this binary_sensor or event entity turns on, every display shows the camera full screen.
        doorbell: z.object({
          entityId: z.string().max(255),
          cameraEntityId: z.string().max(255),
          seconds: z.number().int().min(5).max(300),
        }),
      }),
    }),
  })
  .superRefine((config, ctx) => {
    const viewIds = new Set(config.views.map((v) => v.id));
    const themeIds = new Set(config.themes.map((t) => t.id));
    if (viewIds.size !== config.views.length) ctx.addIssue({ code: "custom", message: "Two views share an id", path: ["views"] });
    if (!themeIds.has(config.themeId)) ctx.addIssue({ code: "custom", message: "Unknown theme", path: ["themeId"] });
    for (const p of PERIODS) {
      if (!viewIds.has(config.schedule[p].viewId))
        ctx.addIssue({ code: "custom", message: "Unknown view", path: ["schedule", p, "viewId"] });
    }
    config.views.forEach((view, vi) => {
      if (view.themeId !== null && !themeIds.has(view.themeId))
        ctx.addIssue({ code: "custom", message: "Unknown theme", path: ["views", vi, "themeId"] });
      view.widgets.forEach((w, wi) => {
        if (w.x + w.w > view.cols || w.y + w.h > view.rows) {
          ctx.addIssue({ code: "custom", message: "Widget runs off the grid", path: ["views", vi, "widgets", wi] });
        }
      });
    });
  });
export type DashboardConfig = z.infer<typeof configSchema>;
