# Everydaypane: guide for agents

Everydaypane is a wall dashboard for the home (in the spirit of MagicMirror, DAKboard and homescreens.dev), built for
Melvin's family in Langley, BC. It runs on a **Ubiquiti UniFi UC-Display21** (a low-power 21.5" 1920 × 1080 touchscreen)
and any other screen with a browser, and is set up from an admin panel that works on phones. This file holds the
decisions behind it, with who made them and when. Follow them; if a task seems to need one changed, raise it with
Melvin first, and update this file in the same change when a decision changes.

## Before proposing or building a feature (rule, Melvin, 2026-11-19)

Melvin, 2026-11-19: "i feel like you keep repeating things that already exist." Before suggesting or starting a feature,
read **What already exists** below (and `widgetSchema` in `src/lib/config/schema.ts`, which is the source of truth
for widgets). Don't suggest anything listed there as new; if an idea extends something that exists, say which part
and what it adds. Every pull request that adds a widget, an integration or a display behaviour updates this list in the
same change, and moves it out of **In progress** when it merges.

## What already exists (checked against the code, 2026-11-22)

**Widgets** (`widgetSchema`, drawn by `src/display/widgets/`):

| Widget (`type`) | What it shows | Data source |
| --- | --- | --- |
| Clock (`clock`) | Digital or analogue, any time zone, label, seconds (Vancouver and Toronto clocks) | Device clock |
| Date (`date`) | Today's date in a time zone | Device clock |
| Weather (`weather`) | Current conditions, hourly, up to 7 days, with icons | Open-Meteo forecast |
| Air quality (`airQuality`) | AQHI or US AQI | Open-Meteo air quality |
| WiFi QR (`wifiQr`) | Join code, optionally the password | Settings document |
| Countdowns (`countdown`) | Days until holidays, birthdays and events, yearly ones roll over | Settings document |
| Schedule (`agenda`) | Today, or the next 1 to 14 days | Google Calendar + iCal links |
| Month calendar (`calendarMonth`) | Month grid or 1 to 6 weeks from this one, Sunday or Monday start, weekends on or off, title toggle | Google Calendar + iCal links |
| Garbage day (`garbage`) | Next pickups, 1 to 8 weeks | Township of Langley (Recycle Coach) |
| Photos (`photos`) | Slideshow, cover or contain, captions | Amazon shared albums, Amazon people, URL lists, photo library (uploads and Google Photos picks) |
| Home Assistant tile (`haEntity`) | Toggle, light, sensor, climate, cover, lock (lock only), button | Home Assistant |
| Camera (`camera`) | UniFi Protect snapshot on a timer | Home Assistant |
| Music (`media`) | Now playing, play/pause, skip, volume, sources | Home Assistant, Spotify or Sonos |
| Note (`note`) | Fixed text from the admin | Settings document |
| Message board (`messages`) | Family notes posted from phones | `messages` table |
| Meals (`meals`) | Breakfast, lunch, dinner for a day or a week | `meals` table |
| Alerts (`alerts`) | Current emergency alerts, optional "all clear" | See alerts below |
| Chore chart (`chores`) | Each kid's chores today, **tap to tick off** (tap again to take back), stars this week and a weekly goal | Settings document + `chores_done` table |
| Sports scores (`sports`) | Live score, last result and next game for followed teams (NHL, NBA, WNBA, NFL, MLB, MLS, Premier League, Champions League) | ESPN public site API |
| To-dos (`tasks`) | Open Google Tasks; **tap to tick off, synced back to Google** (`allowCheck`, 4 s undo) | Google Tasks |
| TransLink departures (`transit`) | Next buses from up to six picked stops, live times, route filter, walk-minutes cutoff | TransLink GTFS-realtime |
| Commute time (`commute`) | Drive times with live traffic from home to up to six places, "leave by" time | TomTom Routing API |
| Rain radar (`radar`) | Animated radar over a map around home: the past 30 min to 3 h, then up to 3 h of forecast; rain or snow, five map areas, still or looping | Environment Canada (MSC GeoMet), Esri grey canvas map |
| Timers (`timer`) | Kitchen timers started from preset buttons on the wall, up to six at once, pause, +1 min; flash, full-screen alert and beeps when done | Device (localStorage) |
| Pomodoro (`pomodoro`) | Focus and break rounds, long break after the last round, optional auto-start, chime between phases | Device (localStorage) |
| BC Ferries (`ferries`) | Next sailings on up to four routes, how full each is, cancellations and delays | Community BC Ferries API (bcferriesapi.ca) |
| Earth wind map (`earth`) | earth.nullschool.net's animated wind globe centred on any place, four zooms, a colour layer (temperature, rain, humidity…), place marker, animation on or off | earth.nullschool.net (framed), Open-Meteo place search |

**Display behaviour:** several views on a drag-and-drop grid (chosen rows and columns), **widgets layered on top of a photos widget**
(photos as the backdrop), a time-of-day schedule
(morning, afternoon, evening, night) choosing the view, theme, day or night mode and dimming; themes with colour
palettes, fonts, corner radius, opacity and optional glass; burn-in protection (pixel shift); offline mode (service
worker serves the last good data and shows "Offline"); a **screen saver** (photos only or dark after idle minutes, dark
in a night window, woken by a tap, Home Assistant motion sensors, the doorbell, a new alert or a timer going off); doorbell pop-up full
screen; the red, dismissible alert strip;
no pinch zoom; settings reach displays by polling every 30 seconds.

**Alerts** (`src/server/alerts.ts`): Alert Ready (NAAD), **Environment Canada weather warnings** (through NAAD),
DriveBC road events and weather conditions, Earthquakes Canada, BC Hydro power outages. Each switchable in `config.alerts.sources`.

**Admin and family:** magic-link sign-in (Resend), admin panel tabs (views and grid editor, themes, displays with
copyable addresses, meals, settings for every integration, Settings › Chores for the kids and their chores), **settings backup and restore** (Settings › Backup, a JSON
file), `/family/` for the message board and meals, Sentry.

**Integrations connected from Settings:** Google Calendar, Google Tasks, Google Photos (Picker), iCal calendar links,
Amazon Photos, the photo library (Vercel Blob), Home Assistant (Cloudflare Tunnel + Access), Spotify, Sonos, garbage
zone lookup, sports teams to follow, TransLink, commute places (TomTom geocoding).

## In progress

Nothing in progress right now. Move new work here when it starts, and to **What already exists** when it merges.

## Commands

```bash
npm run dev            # http://localhost:3000 (admin at /admin/, sign-in links print to the terminal)
npm test               # Vitest unit and integration tests
npm run test:coverage
npm run lint && npm run typecheck && npm run format:check
npm run build          # production build (what Vercel runs)
node scripts/e2e.mjs   # Playwright browser tests against the build (CHROMIUM_PATH=… to use a local Chromium)
```

## Product decisions

- **Name and repo** (Melvin, 2026-11-17): the app is **Everydaypane**, in `mjparinas/everydaypane`. The domain
  everydaypane.com was available on 2026-11-17 but has not been bought yet.
- **Features** (Melvin, 2026-11-17): photos (Amazon Photos, choosable by person), full Google Calendar (a today
  schedule view and a month calendar view), weather for the week with icons, clocks for Vancouver and Toronto, the date,
  a WiFi QR code, countdowns to holidays and birthdays, air quality, garbage pickup from the Township of Langley's
  collection calendar, Home Assistant controls, several views to choose from, views that change by time of day
  (morning, afternoon, evening, night), day and night mode, customizable colour schemes and every widget's settings,
  a drag-and-drop grid with a chosen number of rows and columns.
- **Added the same day** (Melvin, 2026-11-17): offline mode, admin sign-in by magic link through Resend, Sentry,
  burn-in protection, UniFi Protect video (cameras and doorbell pop-ups), a family message board, and emergency alerts.
- **Music** (Melvin, 2026-11-17): Spotify and Sonos controls on the wall, through Home Assistant.
- **Meal planning** (Melvin, 2026-11-17): breakfast, lunch and dinner for each day, planned from a phone and shown on
  the wall (see Architecture).
- **Emergency alerts** (Melvin, 2026-11-17): urgent alerts for Langley, the Lower Mainland, BC and Canada (Alert
  Ready/NAAD, Environment Canada weather warnings, DriveBC road events for torrential rain or snow, Earthquakes Canada,
  tsunami and flooding). They show as a **red strip across the top of the screen that can be dismissed**, not a
  full-screen takeover (`config.alerts.banner` sets the lowest severity that gets the strip).
- **BC Hydro power outages** (Melvin, 2026-11-19: "do bc hydro outages and weather alerts"): outages from BC Hydro's
  outage map join the same alert strip and alerts widget (see Architecture). Weather alerts already existed
  (Environment Canada through NAAD, since 2026-11-17), so that half of the ask needed nothing new.
- **Admin changes reach displays by polling** (Melvin, 2026-11-17: "we dont need real time push for now, polling is
  ok"). Every display asks for the settings version every 30 seconds (a tiny request answered with 304 when nothing
  changed) and reloads its settings when it moves. No WebSocket or push service.
- **Logo** (Melvin asked for one, 2026-11-17): a rounded blue square holding three panes (a tall white one with clock
  hands, an amber "sun" pane, a pale one), and the wordmark "everyday**pane**" in Manrope 800 with "pane" in the brand
  blue. Sources are SVGs in `public/brand/` (mark, simplified 16–32 px favicon, maskable, light and dark wordmarks);
  the PNG icons, `favicon.ico` and the web app manifest (`src/app/manifest.ts`) are made from them.
- **Month calendar title** (Melvin, 2026-11-19: "add a toggle to show/hide month title"): the month widget's
  "November 2026" line can be switched off in its settings (`showTitle`, on by default); the grid takes the space.
- **Month calendar weeks and weekends** (Melvin, 2026-11-21: "allow users to customize how many weeks to display,
  minimum 1, max is 6", and "allow calendar to hide or show weekends"): the month widget shows the whole month (the
  default, as before) or 1 to 6 weeks starting with this one (`weeks`), and can drop the Saturday and Sunday columns
  (`showWeekends`, on by default). Rolling weeks don't dim the next month's days; its first day reads "Dec 1" and the
  title names both months. The calendar feed covers at least the next six weeks for this. Weeks already started on
  Sunday or Monday (`weekStartsOn`).
- **Commute time** (Melvin, 2026-11-19): drive times with live traffic from home to up to six places (work, school),
  set up in Settings › Commute; a place can have a "be there by" time, and the widget then says when to leave (see
  Architecture).
- **Rain radar** (Melvin, 2026-11-21): an animated radar map for the Lower Mainland, the past hour and a short-term
  forecast, from a free source with no key (see Architecture).
- **Chore chart** (Melvin, 2026-11-21): recurring chores for the kids, on chosen weekdays, done by everyone picked or
  rotated between them (each time it's due, or a week each), ticked off with a tap on the wall, with stars per chore
  counted per kid for the week and an optional weekly goal. Separate from Google Tasks (see Architecture).
- **Kitchen timers and pomodoro** (Melvin, 2026-11-21: "1 with visual and sound alerts", then "i want a regular
  timer, and a separate pomodoro"): two widgets, `timer` and `pomodoro` (see Architecture).
- **BC Ferries** (Melvin, 2026-11-21): the next sailings for routes chosen in the widget's settings, with how full
  each one is (see Architecture).
- **Earth wind map** (Melvin, 2026-11-21: "can i add this and specific a location? https://earth.nullschool.net"):
  earth.nullschool.net framed in a widget, centred on a place picked in its settings (Langley by default), with a
  zoom, a colour layer and its own place marker (see Architecture).
- **TransLink departures** (Melvin, 2026-11-19: "add translink"): a TransLink widget with the next buses from up to six
  picked stops, live from TransLink's GTFS-realtime feed (see Architecture).
- **Sports scores** (Melvin, 2026-11-21: "allow to customize the sports and the teams"): any teams from several leagues
  (up to 12), picked in Settings › Sports, with a live score while a game is on, the last result and the next game
  (see Architecture).
- **Screen saver** (Melvin, 2026-11-21): after some minutes with no touch the display shows only photos (full screen,
  optional clock) or goes dark, and during a night window it goes dark; Home Assistant motion sensors keep it awake and
  wake it (see Architecture). Off until switched on in Settings › Screen saver.
- **Canadian English** in everything a person reads (colour, centre, favourite), as in Liftsmith.

## Display: super lightweight (rule, Melvin, 2026-11-17)

"Emphasize super lightweight front end for the dashboard so it loads quickly and is responsive. The backend or admin
panel can be complex if you need it to be."

- The display (`/d/<token>/`) is **not a React page**. It is server-rendered HTML plus one small TypeScript module
  bundled by esbuild (`src/display/` → `public/display/`), with no framework. Widgets update only the DOM nodes that
  change (the clock rewrites one text node a second).
- **Budget:** the display's script stays under 40 KB gzipped and its stylesheet under 10 KB (`scripts/bundle-check.mjs`,
  a CI step). A new dependency on the display needs a very good reason.
- All heavy lifting happens on the server: API calls to Google, weather, Recycle Coach, Amazon and Home Assistant are
  made, cached and trimmed by our routes, and the display fetches small JSON. Images are proxied at display size.
- **No zooming** (Melvin, 2026-11-17: "dont allow pinch zoom on the dashboard"): the display's viewport meta has
  `maximum-scale=1,user-scalable=no`, the page has `touch-action: pan-x pan-y`, and `main.ts` cancels gesture events,
  two-finger moves and ctrl + wheel. The admin panel can still be zoomed.
- Animations use `transform` and `opacity` only. Backdrop blur ("glass") is off by default because it costs GPU time.
- The admin panel and backend may be as complex as needed (Next.js, React, Zustand).

## Stack (Melvin, 2026-11-17: like Liftsmith and Gradelings)

- Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript 6 (`@typescript/typescript6`), Tailwind 4, Zustand,
  Turso/libsql, zod (server and admin only), Vitest, Playwright, ESLint 10 (`eslint-config-next` plus type-aware rules),
  Prettier (width 140, sorted imports).
- **Latest versions, pinned exactly** in `package.json`; Dependabot keeps them current.
- **Strict TypeScript** plus `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`,
  `noImplicitOverride`. No `any` (lint error). Lint runs with `--max-warnings 0`.

## Architecture

- **One settings document** (`src/lib/config/schema.ts`, validated with zod on every save) holds views, widgets,
  themes, the schedule and integration settings. It is versioned: a save names the version it started from, a stale save
  is refused with 409, and every save bumps the version displays poll for (`src/server/config.ts`).
- **Secrets are not in the document.** Tokens (Google refresh token and its scopes, Amazon cookie, Home Assistant
  token) are stored encrypted (AES-256-GCM, key from `SESSION_SECRET`) in the `secrets` table and never sent to a browser
  (`src/server/secrets.ts`). The WiFi password is the exception: showing it is the widget's job.
- **Database:** Turso in production (`DATABASE_URL` + `DATABASE_AUTH_TOKEN`, or the `TURSO_*` pair Vercel's
  integration creates), `file:local.db` in development, memory in tests. Tables are created on first use; migrations only
  ever add (`src/server/db.ts`).
- **Displays** are devices with their own secret address `/d/<token>/`. Requests are matched by the token's hash; the
  token is also kept encrypted (`token_sealed`, like the other secrets) so an admin can show and copy the address again
  from the Displays tab any time (Melvin, 2026-11-17, who didn't want it shown only once). "New link" replaces the
  address and the old one stops working. New addresses use a case-sensitive, 8-character alphanumeric token; the
  database's unique token hash constraint is retried on a collision (Melvin, 2026-11-21). Existing longer addresses
  remain valid. A device shows one view, or follows the time-of-day schedule. Deleting a device signs that screen out.
- **Admin panel** (`src/app/admin/_ui/`): one page with tabs (a bottom tab bar on phones). Edits collect in a working
  copy (a Zustand store per page) and go out together with Save. The grid editor drags with pointer events (mouse and
  touch), resizes from any of a widget's four corners with the opposite corner held still (Melvin, 2026-11-21: "allow
  any corner of a widget to adjust the size"), and also moves and resizes with the keyboard; widgets never leave the
  grid and never overlap, except that other widgets may sit on top of a photos widget (`src/lib/config/grid.ts`).
- **Widgets over photos** (Melvin, 2026-11-21: "allow other widgets to be placed on top of the photos widget"): photos
  widgets are a backdrop layer. Any other widget may cover one; two photos widgets, or two widgets on top, still never
  overlap. A new widget goes in empty cells first and lands on the photos only when nothing else is free. The display
  draws photos first with a lower `z-index`, and marks a widget on top with `on-photo` (`stackOrder`): its panel is never
  thinner than 55 %, and the clock and date (which have no panel) turn white with a soft shadow.
- **Screen saver** (`src/lib/screenSaver.ts` for the rules, `src/display/saver.ts` on the display,
  `config.screenSaver`): the display checks every 15 seconds. Idle counts from the last touch, key, motion, doorbell
  ring, new alert or timer alarm, or from the page load; the night window counts only from real activity, so the 3:30 AM reload
  never lights the screen. One `minutes` setting is both the idle wait and how long a touch at night keeps it awake.
  The saver is a black overlay above the dashboard and its dimming (the `.dim` layer still dims the photos) and below
  the doorbell pop-up and the alert strip, so an emergency stays visible. The dashboard underneath stays mounted but
  `visibility: hidden`, so it is current the moment it wakes and the browser doesn't paint it. A tap on the saver only
  wakes the screen and never presses the widget underneath. Photo mode reuses the photos widget full screen; the clock
  on it wanders a few pixels each minute against burn-in. Motion sensors (`binary_sensor.*`, up to five) are added to
  the entities read from Home Assistant (`usedEntities().all`), never to those that can be controlled; while one is
  `on`, the screen counts as in use. "Dark" is a black screen: a browser can't switch the UC-Display21's backlight off.
  An admin's preview never shows the saver.
- **Family message board:** anyone on `ADMIN_EMAILS` or `FAMILY_EMAILS` posts notes from `/family/`; the author name is
  typed, never the email, because the wall is readable by anyone in the kitchen. Notes can expire; admins pin. Displays
  poll the board every 30 seconds with an ETag.
- **Meal planning** (Melvin, 2026-11-17: "add meal planning", with breakfast, lunch and dinner for each day): one row
  per day and meal in the `meals` table (`src/server/meals.ts`), planned by anyone on `ADMIN_EMAILS` or `FAMILY_EMAILS`
  from the admin panel's Meals tab or `/family/`. A meal saves when its box loses focus (not with the settings Save
  button, since it isn't part of the settings document), and recent meals are offered as suggestions. The meals widget
  shows one day (the next meal highlighted; from 8 PM it shows tomorrow, `nextMeal` in `src/lib/meals.ts`) or up to a
  week, and polls `/api/display/meals/` every minute. Plans older than 60 days are cleared as new ones are written.
- **Google Calendar:** an admin connects one Google account from Settings (OAuth, `calendar.readonly`, redirect
  `<site>/api/google/callback/`); the refresh token is a stored secret, the chosen calendars and their colours live in
  `config.integrations.google.calendars`. The server fetches the month grid around today plus the next six weeks into
  one five-minute feed (`/api/display/calendar/`) that the schedule and month widgets share. Events are placed by the
  dashboard's time zone (tzdata has B.C. on UTC−7 all year from 2026, so don't hard-code −08:00 in tests).
- **Google Tasks** (Melvin, 2026-11-17: he asked for Google Keep, which has no API for personal accounts, and chose
  Tasks instead): the same Google connection, with the `tasks` scope asked for only by "Connect Google Tasks"
  (`src/server/googleTasks.ts`). Settings › Google Tasks switches lists on (`config.integrations.tasks.lists`); a tasks
  widget shows some of them (none picked means all). One one-minute feed (`/api/display/tasks/`) serves every widget.
  A tap on the wall ticks a task off after a four-second undo window, through our own route, and only for a list that
  a widget with `allowCheck` shows; nothing else is ever written to Google. Setup: `docs/google-tasks.md`.
- **Calendar links** (Melvin, 2026-11-17: "can you add support for multiple calendars"): any iCal address (school,
  sports, someone else's Google or Outlook calendar through its secret address) can be added in Settings › Calendar
  links. The address is checked when pasted and stored as an encrypted secret (`ical.<id>`), because it often works as a
  password; the settings document keeps only `integrations.icals` (name, colour, on/off). The server reads each link
  with ical.js (recurring events, exceptions and the file's own time zones; floating times in the dashboard's zone),
  caches it 15 minutes, and merges it into the same calendar feed as Google (`src/server/calendars.ts`). A link that
  fails never hides Google's events or the other links. Only public https addresses are fetched.
- **TransLink:** departure times come only from the GTFS-realtime trip updates
  (`gtfsapi.translink.ca/v3/gtfsrealtime`, key in `TRANSLINK_API_KEY` in Vercel), decoded by a small hand-written
  protobuf reader (`src/server/gtfs.ts`, no protobuf dependency). Route numbers, headsigns and the stop list come from
  the static GTFS zip, read with HTTP range requests (only `routes.txt`, `trips.txt`, `stops.txt`; never
  `stop_times.txt`) and cached three days. A widget stores its stops (`id`, the stop number on the sign, name), so only
  stops on widgets are kept from the region-wide feed. One 30-second read of TransLink is shared by every display
  (`/api/display/transit/`, polled every 30 seconds); the wall counts minutes down from absolute times between reads.
  TransLink's licence notice is shown in the widget's settings and as "Live times from TransLink" on the wall.
  Setup: `docs/translink.md`.
- **Emergency alerts:** `src/server/alerts.ts` reads NAAD's Atom feed (Alert Ready, and Environment Canada's warnings,
  whose own GeoMet API refuses automated readers), DriveBC Open511 (major events and weather conditions) and Earthquakes
  Canada's FDSN text service (the last 24 hours; its distance filter is ignored, so distance is checked here) and BC
  Hydro's outage map data (`outages-map-data.json`, no sign-in; times in epoch ms, polygons as flat longitude, latitude
  lists). An outage whose area covers the home is "severe" (on the strip by default), one within `alerts.powerKm`
  (default 5 km) is "moderate" from 1,000 customers out and "minor" below; restored outages drop out. Each
  source is cached on its own and one failing never hides the others. The red strip sits in the layout's flow, so it
  pushes the widgets down rather than covering them; a tap dismisses it on that screen (localStorage) until a new
  alert arrives.
- **Photos:** sources are in `config.integrations.photos.sources`; a photo widget picks some (none picked means all).
  Amazon has no official API: shared albums use the share page's own endpoints (`/drive/v1/shares/<id>`, then
  `/nodes/<id>/children?tempLink=true`, no sign-in); "photos of people" uses `/drive/v1/search` with
  `people:(…)` and the admin's pasted Amazon cookies (encrypted `amazon.cookie` secret). Lists are cached 30 minutes;
  displays get ids and sizes only, and images come through `/api/display/photo/`, which fetches only photos the server
  listed (never a URL from the request) at the width the cell draws (`viewBox`). Expired temporary links are listed again.
  Amazon turns cloud servers away at times (a 503 robot page, seen 2026-11-17), so Amazon albums are listed every six
  hours, a 503 is retried once after a pause, a refusal isn't retried for 20 minutes, and the last good list is served
  meanwhile. We wait and retry; we never disguise the server or route around Amazon's blocking (for example through
  the home network). Settings › Photos shows each album's photo count or error.
- **Photo library** (Melvin, 2026-11-17, after Amazon turned our server away; he asked for both): a `library` photo
  source keeps its own photos in a **private Vercel Blob store** (`everydaypane-photos`, `BLOB_READ_WRITE_TOKEN`), one
  row each in the `photos` table (`src/server/library.ts`). Photos get in two ways: **uploads** from Settings › Photos,
  shrunk in the admin's browser to at most 2048 px JPEG (so they fit Vercel's 4.5 MB request limit), and **Google
  Photos through Google's Picker API** (`src/server/googlePhotos.ts`, scope `photospicker.mediaitems.readonly`, asked
  for only by "Connect Google Photos"): the admin picks in Google's own window, then the panel has the server copy the
  picks a page at a time (`=w2048-h2048`, with our token; Google's links last an hour, so photos are copied, not
  linked). Videos are skipped and a Google photo is never copied twice into one album. Blobs are never public; displays
  get them only through `/api/display/photo/`. Removing a library album deletes its photos. Setup: `docs/google-photos.md`.
- **Chore chart:** the kids and chores are in the settings document (`config.chores`, edited in Settings › Chores and
  saved with Save); ticks are rows in `chores_done` (one per day, chore and person, with the stars the chore was worth
  then, so changing a chore later doesn't rewrite the week; kept 60 days), `src/server/chores.ts`. Who has a chore on a
  day is worked out, never stored (`assignees` in `src/lib/chores.ts`): turns count from a fixed Monday (2024-01-01),
  so a Monday, Wednesday, Friday chore alternates every time it's due, and changing who is on it starts the turns over.
  Weeks start on Monday. Displays poll `/api/display/chores/` every minute with an ETag; a tap ticks at once (no undo
  delay: a second tap takes it back) and the server accepts only a chore due today for that person, shown by a chores
  widget with `allowCheck`.
- **Commute time:** TomTom's Routing API (`traffic=true`, car, fastest) through `src/server/commute.ts`, with the key in
  `TOMTOM_API_KEY` (Vercel). TomTom was Claude's pick (2026-11-19): free 2,500 requests a day with no credit card, where
  Google's Routes API needs billing for traffic. Home and each place are geocoded once in the admin panel with TomTom's
  Search API; the settings document keeps a label and coordinates (`integrations.commute`), and displays get only names
  and times from `/api/display/commute/`. Each drive is cached five minutes, shared by every display, and six places at
  most keeps that inside the free tier. One route failing never hides the others; readings older than 20 minutes aren't
  shown as live. TomTom takes its key only in the query string, so its URLs are never logged. Setup: `docs/commute.md`.
- **Rain radar:** Environment Canada's 1 km North American radar composite through MSC GeoMet's WMS
  (`geo.weather.gc.ca/geomet`, no key): `RADAR_1KM_RRAI` (rain) or `RADAR_1KM_RSNO` (snow), every six minutes for the
  last three hours, and GeoMet's extrapolation (`Radar_1km_RainPrecipRate-Extrapolation`, `…SnowPrecipRate…`) for the
  forecast (`src/server/radar.ts`). RainViewer, the usual free choice, closed its free API at the start of 2026 (Claude's
  pick of GeoMet, 2026-11-21). The map underneath is Esri's grey canvas (`server.arcgisonline.com`, no key; land as JPEG,
  names as transparent PNG): land without names under the radar and the names on top, light by day and dark in night
  mode; both credits show on the widget. It was CARTO's basemap until CARTO started asking for an API key and drew an
  "API KEY" watermark on the wall (Melvin's screenshot, 2026-11-21). The map is a square
  of 5 × 5 Web Mercator tiles with home in the middle (`src/lib/radar.ts`); each radar picture is one GetMap of exactly
  that square in EPSG:3857, so it lines up with the tiles. Times come from GetCapabilities filtered to one layer
  (cached two minutes). Displays get only the times and, per zoom, the map's tiles and home's pixel (never the
  coordinates); pictures and tiles come through `/api/display/radar/frame/` and `/radar/tile/`, which accept only a
  listed time and tiles of that square and build the upstream address themselves. Observed pictures are kept a day by
  the browser, forecast ones five minutes, tiles a week; the service worker leaves radar pictures alone. The widget stacks
  the pictures and switches their opacity (at most 10 observed and 6 forecast), resting two seconds on the latest and the
  last. This sandbox can't reach GeoMet or Esri, so tests use shapes from their documentation.
- **BC Ferries:** BC Ferries has no public API, so `src/server/ferries.ts` reads the community BC Ferries API
  (`https://www.bcferriesapi.ca/v2/capacity/`, MIT, no key; it reads BC Ferries' current conditions pages every
  minute). Its one answer covers every route with "how full" (the codes in `src/lib/ferries.ts`, departure terminal then
  arrival, such as `TSASWB`), so it is cached two minutes for every widget and display, and the last good copy is
  served when it fails (it answers a bare string, "BC Ferries Data Currently Down", when it has nothing). Displays get
  only the routes on a ferries widget, from `/api/display/ferries/`: sailings that haven't left, in 24-hour Pacific
  time, with percent full (`fill`, and `carFill`), cancellations and delays. The widget drops a sailing five minutes
  after its time on the wall's own clock and labels conditions older than 15 minutes with their time. Its field names
  come from the project's published JSON schema (`schemas/bc-ferries-api-v2-capacity-schema.json`); this sandbox can't
  reach it, so tests use that shape.
- **Earth wind map:** earth.nullschool.net (Cameron Beccario's site) in an `<iframe>`; checked 2026-11-21: it sends no
  `X-Frame-Options` or `frame-ancestors`, and its script handles being framed itself (it blocks only a few named
  sites, hides its app banner and uses its lighter 1° data in a frame). Everything it shows is set by the address's
  hash (`#current/wind/surface/level/overlay=…/orthographic=lon,lat,scale/loc=…/anim=off`), built by `earthUrl` in
  `src/lib/earth.ts`; its scale is the globe's radius in pixels, so the widget's zoom (globe, continent, region, local)
  is a multiple of the cell's short side. The place is stored on the widget (`place` label, `latitude`, `longitude`),
  found by name through `/api/admin/places/` (Open-Meteo's free geocoding, `src/server/places.ts`) or copied from the
  dashboard's location, and sent to earth rounded to two decimals. Earth's wind lines are the heaviest thing a screen
  can run (a load is about 600 KB; it animates on the GPU), so the frame exists only while it can be seen: it is
  removed while the screen saver is up (`html.saving`) or the page is hidden, made again on waking, and made again
  every hour for new weather (earth reads data only when it loads). The frame is sandboxed (`allow-scripts
  allow-same-origin`: no pop-ups or navigating the dashboard), sends no referrer, and takes no touches
  (`pointer-events: none`), so a tap neither spins the globe nor goes unheard by the screen saver. The CSP's
  `frame-src` names earth.nullschool.net and nothing else. This sandbox can't reach earth, so tests check the address
  and the frame's life, not earth itself.
- **Settings backup and restore** (Melvin, 2026-11-21): Settings › Backup downloads the whole settings document as
  `everydaypane-settings-<date>.json` and restores one (`src/server/backup.ts`, `/api/admin/backup/`). The file is the
  document itself, walked generically, so new widget types and settings are in it with no change there. It never holds
  the `secrets` table (tokens, cookies, calendar link addresses), display devices, meals, messages or library photos;
  the file says so in `notIncluded`. WiFi passwords (the one secret in the document) are blanked unless the admin
  switches them on, and a restore without them keeps the dashboard's current ones. A restore is checked first
  (`dryRun`, the panel shows what the file holds), upgraded like a stored document, and saved as an ordinary versioned
  save, so displays reload and a stale restore gets 409.
- **Timers and pomodoro:** run entirely on the display, no server. Each widget keeps its state in localStorage
  (`everydaypane.timer.<id>`, `everydaypane.pomodoro.<id>`), and alarms belong to the screen, not the widget
  (`src/display/alarm.ts`, started by `main.ts`), so a timer still rings after a settings save, a reload, or when the
  time-of-day schedule has switched to a view without it. When one is done the widget flashes; the full-screen alert
  (red flashing, "Tap to stop") and the sound can each be switched off, and both stop by themselves after
  `ringSeconds`. Sound is Web Audio beeps (no sound file); browsers allow it only after a tap, and starting a timer is
  that tap, so a timer started before a page reload rings silently until someone touches the screen. The pomodoro's
  full-screen alert is off by default and it chimes rather than beeps. The arithmetic is in `src/lib/timers.ts`.
- **Sports scores:** ESPN's public site API (`site.api.espn.com/apis/site/v2/sports/<sport>/<league>/…`, no key or
  sign-up) through `src/server/sports.ts`; Claude's pick (2026-11-21) because it covers every league in
  `src/lib/sports.ts` in one shape for free, where the NHL's own API is hockey only and TheSportsDB's free key has no
  live scores. ESPN's API is unofficial, so every answer is parsed leniently and one odd event or team never hides the
  rest. Settings › Sports lists a league's teams (cached a day) and keeps each followed team's ESPN id, name,
  abbreviation and colour in `integrations.sports.teams`. Each team's schedule is read every 30 minutes (a soccer team's
  also with `?fixture=true`, since its plain schedule lists results only); only while a game might be on (ten minutes
  before the start until final, six hours at most) is the league's scoreboard for that Eastern-time day read, every
  30 seconds, for the live score. Displays poll `/api/display/sports/` every 30 seconds. The widget shows a live score,
  a result from the last ten hours (last night's game at breakfast), or the next game; a changed live score flashes.
  No team logos, to keep the display light: each row has the team's colour instead. This sandbox can't reach ESPN, so
  tests use recorded shapes.
- **Garbage pickup:** the Township of Langley's collection calendar (tol.ca) is Recycle Coach, project 521,
  district `LANGL`, with zones such as Monday A or Thursday B. The zone is looked up from the address in the admin
  panel (or picked by hand) and the schedule is fetched and cached by the server (12 hours). The API is Recycle Coach's
  `zone-setup` endpoints on `ca-web` / `us-web.apigw.recyclecoach.com` (tried in that order), as the open-source Home
  Assistant waste_collection_schedule integration uses them; this sandbox can't reach them, so tests use recorded shapes.
- **Home Assistant and UniFi Protect:** the server calls Home Assistant's REST API; displays never talk to it. It is
  reached through a **free Cloudflare Tunnel** (the Home Assistant Cloudflared add-on) at `ha.getliftsmith.com`, not
  Nabu Casa, which costs money (Melvin, 2026-11-17). The tunnel's hostname is locked with **Cloudflare Access**: a
  "Service Auth" policy lets in only requests carrying our service token, which the server sends as
  `CF-Access-Client-Id` / `CF-Access-Client-Secret`. Access answers anything else with a redirect, which we report as
  "Cloudflare Access refused" rather than following. The Home Assistant token and the Access pair are encrypted secrets
  (`homeAssistant.*`), set from Settings. Setup steps: `docs/home-assistant.md`.
  - Only entities on a widget (or the doorbell settings) are read, and only widget entities can be controlled, with a
    fixed set of actions per domain (`serviceFor`). **Locks can be locked, never unlocked** (Claude's default, 2026-11-17,
    to be confirmed by Melvin), because anyone in the kitchen can tap the screen. States are one five-second feed
    shared by every tile and the doorbell.
  - UniFi Protect cameras and the doorbell come through Home Assistant's UniFi Protect integration, because Protect
    itself is only on the local network. Camera pictures go through `/api/display/camera/` (snapshots from
    `camera_proxy`, refreshed on a timer, never a video stream, which would be heavy for the UC-Display21).
  - **Doorbell pop-up:** when the ring entity (an `event.` entity's new timestamp, or a `binary_sensor.` turning on)
    changes, every display shows that camera full screen for the set seconds, refreshed each second; a tap closes it.
  - **Music** (Melvin, 2026-11-17: Spotify and Sonos controls): the Music widget drives a `media_player` from Home
    Assistant's Sonos or Spotify integration, so that route needs no Spotify or Sonos sign-in of our own. It shows what's
    playing (from the shared five-second feed), play/pause, skip, volume and the player's sources (Sonos favourites,
    Spotify Connect speakers). Album art comes through `/api/display/art/` (Home Assistant's `media_player_proxy`,
    players on a widget only); only a hash of the art link reaches displays, because the link carries a token.
  - **Spotify and Sonos signed in directly** (Melvin, 2026-11-18: asked for music without Home Assistant, "build along
    side it"): a Music widget's `provider` is `homeAssistant` (the default, unchanged), `spotify` (whatever the
    connected account plays, on any speaker; its sources are the Spotify Connect devices) or `sonos` (one speaker,
    controlled with the group it is in; its sources are the Sonos favourites). Each account is connected once from
    Settings › Music (OAuth with the client secret as Basic auth, `src/server/musicAuth.ts`; developer apps from
    `SPOTIFY_*` / `SONOS_*` in Vercel); the refresh tokens are encrypted secrets. The server reads Spotify's Web API
    and Sonos's cloud Control API into one feed shaped like Home Assistant's media players (`/api/display/music/`,
    polled every five seconds, a few seconds' server cache), so the widget draws both the same way. Only players on a
    widget, a fixed set of actions, and speakers or favourites from the account's own list; art only from addresses
    the feed read, public https only. Controlling Spotify needs Premium, and the widget says so when Spotify refuses.
    Setup: `docs/music.md`.

## Security

- **Sign-in by magic link** (Melvin, 2026-11-17), as Liftsmith's admin does it: a one-time link (15 minutes) emailed
  through Resend to an address on `ADMIN_EMAILS` (full admin) or `FAMILY_EMAILS` (message board only). The lists live in
  the environment, so nothing a request writes can make someone an admin; removing an address signs it out. Links and
  sessions are stored only as hashes. The emailed link opens a page whose button uses the link up, so mail scanners
  can't. A link is used up in one statement, so two racing requests can't both sign in.
- Sign-in tries are rate-limited in the database (one atomic upsert), per address and per IP.
- Requests that change something must come from our own origin (`sameOrigin`).
- Security headers on every response (`src/lib/securityHeaders.ts`): HSTS, nosniff, `frame-ancestors 'none'`, a CSP
  that allows only our own origin (and Sentry's ingest, and earth.nullschool.net as the one frame), and a Permissions-Policy that turns off camera, microphone
  and location.
- Error reports are scrubbed of emails, display tokens and cookies before they leave (`src/lib/sentryScrub.ts`).

## Monitoring (Melvin, 2026-11-17)

- **Sentry**, off unless `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` is set. Server errors through `instrumentation.ts`.
  The admin panel loads the Sentry library only after the first error (as in Gradelings). The display never loads it:
  it posts its errors to our own route, which forwards them to Sentry from the server.

## Testing and CI/CD (Melvin, 2026-11-17: "dont forget testing in cicd")

- `.github/workflows/ci.yml` runs on every pull request and every push to `main`: types, lint, formatting and
  dependency audit; Vitest with coverage; the production build; and the Playwright browser tests against that build
  (`scripts/e2e.mjs`, which signs in through a real magic link and fails on any console error). **"CI passed"** is the
  one check to require. A new push to a pull request cancels its stale run, but runs on `main` are never cancelled:
  each merge commit gets its own full run, because merges land minutes apart and a cancelled run left them unchecked.
- A bug fix comes with a test that fails without it. Flaky tests are fixed at the cause, never retried.
- Test data is plain and readable; nothing random.
- **Agents fix and merge their own pull requests** (Melvin, 2026-11-17: "auto fix and merge prs please"). An agent
  fixes CI failures and review feedback on the pull requests it opens, and merges each one once "CI passed" is green.
  Stacked pull requests merge in order, the base first, with a merge commit so the next one stays clean.
- **Dependabot** (`.github/dependabot.yml`) opens weekly pull requests for npm (minor and patch grouped) and GitHub
  Actions.

## Hosting (Melvin, 2026-11-17)

- **Vercel**, deployed by Vercel's GitHub integration: a merge to `main` deploys to production. The project is
  `everydaypane` in team `melvins-projects-b69f55c3` (created 2026-11-17). Environment variables live in Vercel, never in
  the repo (`.env.example` lists them).
- **Preview deployments are off**, as in Liftsmith; CI's own build and browser tests cover pull requests.
- **Vercel Authentication is off** for this project: a display can't sign in to Vercel, and every page and API route
  checks its own session or display token.
- **Address:** `pane.getliftsmith.com` until everydaypane.com is bought (Melvin, 2026-11-17). getliftsmith.com's DNS is
  on Cloudflare, so the record there is a DNS-only (grey cloud) CNAME `pane` → `cname.vercel-dns.com`.
  `NEXT_PUBLIC_SITE_URL` in Vercel holds the address used in sign-in links.
- **Sign-in email** is sent from `hello@getliftsmith.com` (verified in Resend, click tracking off so links aren't
  rewritten) until everydaypane.com is bought (Melvin, 2026-11-17). `ADMIN_EMAILS` is Melvin's own address.
- **Database:** a Turso database from the Vercel Marketplace integration, connected to the project (its `TURSO_*`
  variables are read by `src/server/db.ts`).

## Code conventions

- Prettier formats every code file; run `npm run format` before committing.
- Server-only modules start with `import "server-only"`. The display never imports zod or React.
- Comments explain why, and name who decided and when for product rules.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->
