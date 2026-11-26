# Everydaypane: guide for agents

Everydaypane is a wall dashboard for the home (in the spirit of MagicMirror, DAKboard and homescreens.dev), built for
Melvin's family in Langley, BC. It runs on a **landscape kitchen wall panel** (about 1920 × 1080 touch)
and any other screen with a browser, and is set up from an household panel that works on phones. This file holds the
decisions behind it, with who made them and when. Follow them; if a task seems to need one changed, raise it with
Melvin first, and update this file in the same change when a decision changes.

## Before proposing or building a feature (rule, Melvin, 2026-11-19)

Melvin, 2026-11-19: "i feel like you keep repeating things that already exist." Before suggesting or starting a feature,
read **What already exists** below (and `widgetSchema` in `src/lib/config/schema.ts`, which is the source of truth
for widgets). Don't suggest anything listed there as new; if an idea extends something that exists, say which part
and what it adds. Every pull request that adds a widget, an integration or a display behaviour updates this list in the
same change, and moves it out of **In progress** when it merges.

## What already exists (checked against the code, 2026-11-25)

**Widgets** (`widgetSchema`, drawn by `src/display/widgets/`):

| Widget (`type`) | What it shows | Data source |
| --- | --- | --- |
| Clock (`clock`) | Digital, analogue, flip, nixie, word, minimal or neon; any time zone, label, seconds (Vancouver and Toronto clocks) | Device clock |
| Date (`date`) | Today's date in a time zone | Device clock |
| Sunrise & sunset (`sunTimes`) | Today's sunrise, sunset and length of daylight; optional emoji, daylight hours and **tonight's moon phase** (`showMoon`) | Open-Meteo forecast; moon worked out on the device |
| Moon phase (`moon`) | Drawn moon disc, phase name, % lit, next full and new moon, traditional full moon names (Cold Moon, Harvest Moon) | Worked out on the device (`src/lib/moon.ts`, Meeus) |
| Aurora tonight (`aurora`) | Tonight's peak Kp, chance of seeing it from home (good / possible / slim / unlikely), Kp needed here, G storm level, a bar per three-hour block for the next day | NOAA SWPC planetary Kp forecast (`src/server/aurora.ts`) |
| Weather (`weather`) | Current conditions (the largest thing on the tile, scaled to the space left), hourly, up to 7 days as a smaller row, with icons, UV index and pollen | Open-Meteo (default) or Environment Canada city page (`config.weather.provider`); UV/pollen/AQ still Open-Meteo |
| Tempest (`tempest`) | Backyard station: temp, humidity, wind, rain today | WeatherFlow REST (`config.integrations.smartHome.tempest`, token secret) |
| EcoFlow (`ecoflow`) | Each power station's battery %, power in and out, solar, AC and DC flows, time to full or empty; pick devices or show all | EcoFlow IoT Developer Platform (household access and secret keys, `docs/ecoflow.md`) |
| Laundry (`laundry`) | Each washer and dryer: phase, time left, "Done" until the next cycle or `doneMinutes`; optional blue done notice on the alert strip; pick machines, hide idle | LG ThinQ Connect (household's personal access token) + Samsung through the SmartThings connection (`docs/laundry.md`) |
| Weather Underground (`weatherUnderground`) | PWS current conditions | IBM WU PWS API (`WU_API_KEY` or per-account secret) |
| School menu (`menus`) | Nutrislice breakfast and lunch for a day or week; not the meal plan | Nutrislice published JSON (`config.integrations.smartHome.menus`) |
| Air quality (`airQuality`) | AQHI or US AQI (outdoor) | Open-Meteo air quality |
| Sprinklers (`rachio`) | Each Rachio controller's next watering (when, schedule, minutes, zones), rain delay, offline; optional **Skip** with a second tap (`allowSkip`) | Rachio public API (household API key, `docs/rachio.md`) |
| Pool (`blueRiiot`) | Water temperature, pH, ORP, salinity and (after a test strip) free chlorine per pool, green/amber/red by Blue Riiot's own ranges, when last measured; pick readings and pools | Blue Riiot's **unofficial** app cloud API (household's app email and password, `docs/blue-riiot.md`) |
| Indoor air (`airthings`) | Radon, CO₂, VOC, PM2.5, PM1, humidity and temperature per Airthings monitor, green/amber/red by Airthings' levels; pick readings and devices | Airthings consumer API (household's own API client, `docs/airthings.md`) |
| WiFi QR (`wifiQr`) | Join code, optionally the password | Settings document |
| Phone edit QR (`editQr`) | QR to `/d/<token>/edit/` for meals, shopping and messages with no sign-in | This display's address |
| Countdowns (`countdown`) | Days until holidays, birthdays and events, yearly ones roll over | Settings document |
| Schedule (`agenda`) | Today, or the next 1 to 14 days | Google Calendar + Microsoft 365 + iCal links, family events |
| Month calendar (`calendarMonth`) | Month grid or 1 to 6 weeks from this one, Sunday or Monday start, weekends on or off, title toggle, fit titles (wrap/shrink, on by default), scroll after N weeks (default 3), optional tap-to-open day details with every event and its source colour | Google Calendar + Microsoft 365 + iCal links, family events |
| Week calendar (`calendarWeek`) | One week in a grid, optional weekends | Same calendar feed |
| Up next (`calendarUpNext`) | The next event large, with a short following list | Same calendar feed |
| Garbage day (`garbage`) | Next pickups, 1 to 8 weeks | Township of Langley (Recycle Coach) |
| Photos (`photos`) | Slideshow, cover or contain, captions | Amazon shared albums, Amazon people, URL lists, photo library (uploads and Google Photos picks), Bing picture of the day, Reddit, weather-linked albums, Immich, Dropbox, OneDrive, Box, Flickr, SmugMug, iCloud published links (`docs/icloud-photos.md`) |
| Smart device (`haEntity`) | Toggle, light, sensor, climate, cover, lock (lock only), button; `provider` Home Assistant (default), **Nest**, **ecobee**, **SmartThings**, **Govee lights** (on/off, brightness, colour swatches, scenes), **Philips Hue lights** or **LIFX lights** (on/off, brightness, colour swatches) | Shared `/api/display/ha/` feed; OAuth + REST for native providers and Hue, an API key for Govee, a personal token for LIFX (`docs/nest.md`, `docs/ecobee.md`, `docs/smartthings.md`, `docs/govee.md`, `docs/hue.md`, `docs/lifx.md`) |
| UniFi network (`unifi`) | Online / slow / down, latest latency and packet loss, minutes down and last outage in 24 h, 24 h latency chart, clients and devices, optional current usage, ISP | UniFi Site Manager API (`api.ui.com`, `unifi.apiKey` secret, `docs/unifi.md`) |
| Camera (`camera`) | UniFi Protect snapshot on a timer | Home Assistant |
| Music (`media`) | Now playing, play/pause, skip, volume, sources | Home Assistant, Spotify or Sonos |
| Note (`note`) | Fixed text from the admin | Settings document |
| Message board (`messages`) | Family notes from phones; optional **post from the wall** (`allowAdd`) | `messages` table |
| Meals (`meals`) | Breakfast, lunch, dinner for a day or a week; recurring cadences fill future days | `account_meals` + `account_meal_rules` |
| Shopping list (`shopping`) | Groceries from phones; **tap to tick off** (`allowCheck`); optional **add from the wall** (`allowAdd`); optional bought items | `shopping` table |
| Who's home (`presence`) | Who is home, from person and device tracker entities, read only | Home Assistant |
| School status (`school`) | Open, closed, delayed or late start; optional school names | District status page (`config.school`) |
| Whiteboard (`whiteboard`) | Finger draw with a few colours and an eraser; wider tiles show more colours; hold Clear to wipe; same doodle on every display | `whiteboard` table |
| Alerts (`alerts`) | Current emergency alerts, optional "all clear" | See alerts below |
| Chore chart (`chores`) | Today's chores by **morning/afternoon/evening** (or anytime), **tap to tick off**, completion dots / progress rings, stars this week, optional **star rewards** and **child PIN**; kids phone at `/d/<token>/chores/` and `/family/chores/` | Settings document + `chores_done` + `chore_redemptions` |
| Sports scores (`sports`) | Live score, last result and next game for followed teams (NHL, NBA, WNBA, NFL, MLB, MLS, Premier League, Champions League) | ESPN public site API |
| To-dos (`tasks`) | Open tasks from **Google Tasks, Microsoft To Do or Todoist** (`provider`); **tap to tick off** (`allowCheck`, 4 s undo) | Unified `/api/display/tasks/` feed |
| Packages (`packages`) | UPS, FedEx, Canada Post, USPS tracking numbers on the widget; live status when `PACKAGE_TRACK_API_KEY` is set | Optional 17track-style API (`src/server/packages.ts`) |
| Snow report (`snow`) | New snow in the last 24 h, snow depth and snowfall today and the next two days, optional mountain temperature, for picked mountains (Cypress, Grouse, Seymour, Whistler by default; Sasquatch, Manning Park, Mt. Baker, Sun Peaks) | Open-Meteo forecast at each mountain's mid-mountain elevation (model estimate, no key) |
| River levels (`rivers`) | Up to six river and creek gauges (Fraser at Mission and Hope, Salmon and Nicomekl in Langley, or any station by number): level, rising/falling/steady with the 6 h and 24 h change, a day's line, optional flow | Environment Canada real-time hydrometric (MSC GeoMet OGC API, Datamart CSV fallback) |
| Tides (`tides`) | Next highs and lows at a station, optional height, optional **day curve** with a "now" line (`showCurve`); station search by name in its settings | Canadian IWLS + NOAA (US) (`docs/tides.md`) |
| TransLink departures (`transit`) | Next buses from up to six picked stops, live times, route filter, walk-minutes cutoff | TransLink GTFS-realtime |
| Commute time (`commute`) | Drive times with live traffic from home to up to six places, "leave by" time | TomTom Routing API |
| Rain radar (`radar`) | Animated radar over a map around home: the past 30 min to 3 h, then up to 3 h of forecast; rain or snow, five map areas, still or looping | Environment Canada (MSC GeoMet), Esri grey canvas map |
| Wildfires (`wildfires`) | Active fires around home on the radar's map, coloured by stage of control (fires of note ringed), burned areas, evacuation orders and alerts, the nearest 0 to 5 fires listed; five map areas, fires under control on or off | BC Wildfire Service and EmergencyInfoBC public ArcGIS layers, Esri grey canvas map |
| Timers (`timer`) | Kitchen timers started from preset buttons on the wall, up to six at once, pause, +1 min; flash, full-screen alert and beeps when done | Device (localStorage) |
| Pomodoro (`pomodoro`) | Focus and break rounds, long break after the last round, optional auto-start, chime between phases | Device (localStorage) |
| Highway cameras (`drivebc`) | Still pictures from up to four DriveBC highway cameras (Hwy 1, Port Mann, Coquihalla…), side by side or one at a time, refreshed every 1–15 min, paused under the screen saver; delayed or switched-off cameras say so | DriveBC site feed + `www.drivebc.ca/images/<id>.jpg`, OGL-BC (`docs/drivebc.md`) |
| BC Ferries (`ferries`) | Next sailings on up to four routes, how full each is, cancellations and delays | Community BC Ferries API (bcferriesapi.ca) |
| Border wait times (`borderWait`) | Car waits at Point Roberts, Peace Arch, Pacific Highway, Aldergrove and Abbotsford–Sumas, into the U.S. and into Canada (or one way), coloured green/amber/red, fastest marked, optional NEXUS; old readings greyed | CBSA open data (`bwt-eng.csv`) and U.S. CBP (`bwt.cbp.gov/api/bwtnew`), no key |
| Earth wind map (`earth`) | earth.nullschool.net's animated wind globe centred on any place, four zooms, a colour layer (temperature, rain, humidity…), place marker, animation on or off | earth.nullschool.net (framed), Open-Meteo place search |
| Windy map (`windy`) | Windy's map centred on any place, one layer (radar, rain, wind, gusts, temperature, clouds, new snow, thunderstorms, satellite, PM2.5), zoom 3–11, place marker, pressure lines, touch on or off | embed.windy.com (framed), Open-Meteo place search |
| Stocks (`stocks`) | Watchlist quotes with daily change | Yahoo Finance (unofficial) or Finnhub with `FINNHUB_API_KEY` |
| Crypto (`crypto`) | Coin prices and 24 h change | CoinGecko free API |
| FX (`fx`) | Currency pair rates | Frankfurter / ECB |
| YNAB (`ynab`) | Budget name, on-budget accounts and categories | YNAB API (token or OAuth) |
| TradingView (`tradingView`) | Chart iframe for a symbol | s.tradingview.com (framed) |
| Fitbit (`fitbit`) | Steps, sleep and resting heart rate today | Fitbit OAuth |
| Oura (`oura`) | Last night's sleep score, readiness and activity (with steps); optional night details (hours asleep, bedtime, HRV, lowest heart rate), off by default | Oura API v2 OAuth (`docs/oura.md`) |
| Gmail unread (`emailCount`) | Inbox unread count | Google `gmail.readonly` add-on scope |
| RSS (`rss`) | Headlines from chosen feed URLs | Server fetch + trim |
| News (`news`) | CBC/BBC presets, custom RSS or GNews | RSS or `GNEWS_API_KEY` |
| On this day (`onThisDay`) | 1 to 5 moments from history or birthdays for today, family-friendly filter on by default, same picks all day | Wikipedia's featured "On this day" feed |
| Dad joke (`dadJoke`) | One joke, family-friendly option | icanhazdadjoke.com |
| Quotes (`quotes`) | Short quotations with authors | quotable.io |
| Affirmation (`affirmation`) | One calm daily line; categories and optional custom lines | Curated bank (`src/lib/affirmations.ts`) |
| Horoscope (`horoscope`) | Playful daily blurb for a zodiac sign | Curated bank (`src/lib/horoscope.ts`) — not a live astrology feed |
| Instagram (`instagram`) | Public post embed (not profiles) | instagram.com embed iframe |
| Trello (`trello`) | Lists and open cards on a board | Trello REST (`TRELLO_API_KEY` + token) |
| Slack (`slack`) | Latest messages from channels | Slack OAuth (read-only) |
| YouTube (`youtube`) | Video or playlist embed | youtube.com iframe |
| Vimeo (`vimeo`) | Video embed | player.vimeo.com iframe |
| Airports (`airports`) | METAR summary per ICAO code; optional delays | Aviation Weather; Aviationstack with `AIRPORT_API_KEY` |
| Google Maps (`maps`) | Map for a place query | google.com/maps embed iframe |
| Internet (`internet`) | Ping every 10 s to 5 min with Online / Slow / Offline, a graph of the last 60 checks and the share that failed; download and upload speed every 1 to 24 h or on a tap | The screen's own browser against Cloudflare's speed test servers |

**Display behaviour:** several views on a drag-and-drop grid (chosen rows and columns, gap, edge padding and **tile padding**; presets include **12×8 landscape** and **8×12 portrait**, with portrait stages letterboxed on a landscape panel), **per-widget visibility by part of day** (`visiblePeriods`), optional **view loop** on schedule followers (`schedule.loopSeconds`), **widgets layered on top of a photos widget**
(photos as the backdrop), **per-widget background** (on/off and opacity; theme surface opacity is the default; clocks and dates start with no panel), **per-widget font size** (`fontScale`, 70–150 %, text widgets only — not photos, radar, wildfires, camera, earth, Windy, embeds or the whiteboard), **per-widget outer padding** (`outerPadding`, 0–48 px, omitted means none; insets the panel in its grid cell), a time-of-day schedule
(morning, afternoon, evening, overnight) choosing the view, theme, day or night mode and dimming — each period can start at a **fixed time, sunrise or sunset** (sunrise/sunset from today's Open-Meteo weather at the dashboard location); themes with colour
palettes, fonts, corner radius, opacity and optional glass; burn-in protection (pixel shift); offline mode (service
worker serves the last good data and shows "Offline"); a **screen saver** (photos only or dark after idle minutes, dark
in a night window, woken by a tap, Home Assistant motion sensors, the doorbell, a new alert or a timer going off); doorbell pop-up full
screen; the red, dismissible alert strip;
no pinch zoom; display and shared-feed polling pauses while hidden or browser-offline, backs off after failures, and
resumes when visible/online; settings normally poll every 30 seconds (**Household** also long-polls for instant reload),
and state responses carry a tiny release version header even on `304`s (a new release reloads the wall **once**; if the page still names the old release it keeps running rather than loop, `src/display/release.ts`);
**starter view templates** (~20 layouts with screenshot previews) on the Views tab; themes include Outfit, DM Sans and
Literata; Displays tab tips for casting
`/display/`; Vancouver clocks, dates, calendars and scheduled views stay on UTC−7 after B.C.'s March 2026 change
even when the display browser has old time-zone data.

**Marketing site** (public pages, Melvin, 2026-11-23): homepage at `/` (no longer redirects to admin), with a **Connect a display** link in the header, hero and footer that opens `/display/` (Melvin, 2026-11-25: so a wall screen taps it instead of typing the address), plus `/pricing/`,
`/features/` (every widget with a real-widget sample PNG from `public/features/widgets/`, regenerated with
`npm run templates:previews` alongside starter templates), `/compare/` (and per-competitor pages including Home Screens), `/blog/` with RSS,
`/privacy/`, `/terms/`, `/contact/`, `robots.ts` and `sitemap.ts`. Built like Tuned/Liftsmith (`src/components/site/`,
Manrope display, template preview screenshots from `public/templates/` — no personal photos in OG). Free vs
**Household** pricing copy in `src/lib/marketingPlans.ts`; checkout uses the existing Stripe Household flow
(`POST /api/household/billing/?action=checkout`). Footer shows version + short commit with no GitHub link (`src/lib/build.ts`).
The features catalogue lives in `src/lib/marketingFeatures.ts` (grouped like the admin widget picker).

**Alerts** (`src/server/alerts.ts`): Alert Ready (NAAD), **Environment Canada weather warnings** (through NAAD),
DriveBC road events and weather conditions, Earthquakes Canada, BC Hydro power outages, **EmergencyInfoBC evacuation orders and alerts** (any hazard, covering the home or within `alerts.evacuationKm`). Each switchable in `config.alerts.sources`.
Optional high radon and CO₂ from Airthings (`config.integrations.smartHome.airthings`, off by default).
Optional pool water past Blue Riiot's warning range (`config.integrations.smartHome.blueRiiot.alerts`, off by default).
**Washer and dryer done** notices (`config.integrations.smartHome.laundry.alertDone`, on by default, needs a Laundry widget on a view): blue instead of red (`notice`), shown whatever the strip threshold, never emailed and left out of the Alerts widget.
Optional email to everyone on `ADMIN_EMAILS` and `FAMILY_EMAILS` when a new strip-worthy alert arrives (`config.alerts.notifyEmail`).

**Household and family:** Clerk Account Portal in production (`accounts.everydaypane.com/sign-in` and `/sign-up`, from `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `SIGN_UP_URL`); local and CI stay on `/signin/`; Turso
`account_members` stays the source of truth for household roles; `user.created` webhook seeds Free households
(`docs/clerk.md`). Wall displays open **`/display/`** and unlock with a **phone QR** (or a signed-in picker) at
`/display/unlock/` / `/signin/phone/` — display auth is **not** Clerk; household panel at `/household/` (views and grid editor, themes, displays with the
shared wall address **and a phone-edit QR/link**, meals, shopping, settings for every integration, Settings › Chores for
the kids and their chores),
**settings backup and restore** (Settings › Backup, a JSON file), `/family/` for the message board, **family calendar
events**, meals and the shopping list, **`/d/<token>/edit/`** (same meals, shopping and messages with no login — scan the
edit QR or open the Displays link), Sentry. Settings is grouped with a sticky jump nav and `#settings/…` deep links;
bounded numbers use sliders or −/+ steppers that show min–max (not browser number arrows). Views default to a **12×8**
grid with gap 16 / edge 14 / tile 16 for the 1920×1080 wall panels, with one-tap grid presets and a grouped widget
picker. The Views tab embeds one **live editable layout** (the real display under a transparent drag overlay, working
copy over `postMessage` before Save); tapping a widget opens its settings in a **right slide-out**, and **Edit view**
(on the view tabs row) opens the same kind of drawer for name, grid, gap, edge, tile and theme so the preview stays
visible. Draft edits patch widgets in place instead of remounting the whole stage. View previews can force day or night
with `?mode=`, and a quiet Day/Night control on the preview swaps without reloading. **Free upgrade CTAs** (Melvin,
  2026-11-23; quieter 2026-11-24 critique): Free accounts see a Plan chip, **Household** badges on blocked controls
  (Add-widget paid cards, Settings soft-locks), greyed controls that open an in-app upgrade dialog (`#upgrade`, Stripe
  Checkout), and Settings › Plan; idle nav is not badged. Core Free tools (views editor, colours, displays within limit,
  photos, calendars) stay fully usable.

**Platform admin** (`/admin/`): Everydaypane ops for `ADMIN_EMAILS`,
separate from the household panel — same split as Tuned and Liftsmith. Staff use the same Clerk sign-in as households,
gated by that allow-list; Overview through Log (Households, Displays,
Revenue, Traffic, Codes, Flags, …). Cookieless marketing beacon. Customer path is `/household/`. **Flags** has an
on/off switch for every widget, smart-home provider, music and to-do service and photo source, for everyone; there
are no per-household overrides (see Architecture, Feature flags).

**Integrations connected from Settings:** Google Calendar, Microsoft 365 calendars and **To Do** (OAuth, `?todo=1` / `?files=1`), Google Tasks, **Todoist**, Google Photos (Picker), iCal calendar links (with iCloud publish steps in Settings and `docs/icloud-calendar.md`),
**Govee** (API key, Settings › Smart home), **Philips Hue** (OAuth, Settings › Smart home), **LIFX** (personal token, Settings › Smart home), Amazon Photos, **photo sources** (Bing, Reddit, weather albums, Immich API keys, Dropbox/Box/SmugMug OAuth, OneDrive via Microsoft, Flickr API key, iCloud published URLs), the photo library (Vercel Blob), Home Assistant (Cloudflare Tunnel + Access), Spotify, Sonos, garbage
zone lookup, sports teams to follow, TransLink, commute places (TomTom geocoding), optional **package tracking** key, **UniFi Site Manager** API key (Settings › UniFi network), **EcoFlow** access and secret keys, **Oura** (OAuth, Settings › Content & finance), **Airthings** (API client id and secret, Settings › Indoor air), **Rachio** (API key, Settings › Sprinklers), **Blue Riiot** (app email and password, Settings › Pool; unofficial), **LG ThinQ** personal access token (Settings › Laundry).

## In progress

- **Launch & growth** (Melvin, 2026-11-23): public Free signup, Household billing UI, marketing/legal copy, SEO polish and GTM checklist — see [`docs/launch.md`](docs/launch.md).

## Commands

```bash
npm run dev            # http://localhost:3000 (household at /household/, platform admin at /admin/, sign-in links print to the terminal)
npm test               # Vitest unit and integration tests
npm run test:coverage
npm run lint && npm run typecheck && npm run format:check
npm run build          # production build (what Vercel runs)
npm run build:icons    # favicon.ico, Apple touch icons and PWA PNGs from public/brand/
node scripts/e2e.mjs   # Playwright browser tests against the build (CHROMIUM_PATH=… to use a local Chromium)
npm run templates:previews  # regenerate public/templates/*.png from real widgets + sample feeds
```

## Product decisions

- **Name and repo** (Melvin, 2026-11-17): the app is **Everydaypane**, in `mjparinas/everydaypane`. Melvin will register
  **everydaypane.com** (live; `NEXT_PUBLIC_SITE_URL` points at www).
- **Brand name casing** (Melvin, 2026-11-23): written and titled as **Everydaypane** (one word, capital E only — not
  EverydayPane or Everyday Pane). The wordmark keeps everyday**pane** with "pane" in the brand blue; URLs and handles
  stay `everydaypane`. "Everyday Pane" is fine once when saying the name aloud; don't invent a third written form.
  Short form later, once the full name is known: Pane.
- **Branded outbound email** (Melvin, 2026-11-23; Clerk 2026-11-24): alert notifications (and any other Resend mail)
  use the shared chrome in `src/lib/email.ts` — brand blue `#3b5bdb`, the mark, everyday**pane**
  wordmark, soft `#f6f7fb` page and white card. Sign-in codes are sent by Clerk; brand those templates in the Clerk
  Dashboard to match. New Resend email kinds reuse `email.ts`; don't invent a third template style.
- **Clerk for identity** (Melvin, 2026-11-24): household and staff sign-in move to Clerk; Turso keeps household
  membership and Stripe/plan data; wall QR unlock stays on `device_sign_ins` / `ep_wall` / `ep_display`. Setup:
  [`docs/clerk.md`](docs/clerk.md).
- **Paid multi-tenant product** (Melvin, 2026-11-22): Everydaypane is a **Free + one paid (“Household”)** app other
 families can use. Free is DAKboard-like (1 view, 2 calendars, 2 displays, core widgets only). Household unlocks
 everything. Melvin’s existing install is grandfathered on Household (`acct_legacy`). Stripe Checkout + Customer Portal
 + webhooks (`src/server/billing.ts`); Free signup is the Clerk Account Portal, and `user.created` seeds the household.
- **Free upgrade UX in household** (Melvin, 2026-11-23: articulate what Free is missing without being annoying; quieter
  2026-11-24 critique): paid features show a **Household** label only on blocked controls and are soft-locked (greyed;
  tap opens the upgrade dialog with why-upgrade copy and Checkout). Primary CTA is the Plan chip (plus Save errors,
  Displays limit, widget picker, settings soft-locks); no banner or idle-nav badge rain. Free core remains highly usable.
  Plan state from `/api/household/billing/` via `PlanProvider` (`src/app/household/_ui/plan.tsx`).
- **Household vs platform admin** (Melvin, 2026-11-23: rename `/admin` → `/household`, reserve `/admin` like Tuned and
  Liftsmith; expanded 2026-11-23 to full Tuned-style ops): household settings live at **`/household/`** (API
  `/api/household/`); **`/admin/`** is Everydaypane platform ops. Staff sign in with Clerk (Melvin, 2026-11-25: no in-app 2FA),
  `ADMIN_EMAILS`, and tabs for work, numbers, people and running the product. Member role `admin` in
  the database still means “household admin”.

- **Marketing homepage** (Melvin, 2026-11-23): public marketing site at `/` with pricing, features, compare, blog, privacy and terms; paid plan marketed as Household (same Stripe `STRIPE_PRICE_ID` as household billing).
- **Launch & organic growth** (Melvin, 2026-11-23): self-serve Free signup from “Start free”, honest Free limits (2 displays / 1 view / 2 calendars), Household upgrade in Settings, privacy-first measurement (Search Console + Stripe, no product analytics until opted in). Living checklist and promo playbook: [`docs/launch.md`](docs/launch.md).
- **Features** (Melvin, 2026-11-17): photos (Amazon Photos, choosable by person), full Google Calendar (a today
 schedule view and a month calendar view), weather for the week with icons, clocks for Vancouver and Toronto, the date,
 a WiFi QR code, countdowns to holidays and birthdays, air quality, garbage pickup from the Township of Langley's
 collection calendar, Home Assistant controls, several views to choose from, views that change by time of day
 (morning, afternoon, evening, overnight), day and night mode, customizable colour schemes and every widget's settings,
 a drag-and-drop grid with a chosen number of rows and columns.
- **Schedule sunrise/sunset and overnight** (Melvin, 2026-11-22): each part of the day can start at a fixed time,
 sunrise or sunset; the overnight period was renamed from "night" in the admin (the settings key stays `night`).
- **Added the same day** (Melvin, 2026-11-17): offline mode, admin sign-in (Resend magic links then; Clerk since 2026-11-24), Sentry,
  burn-in protection, UniFi Protect video (cameras and doorbell pop-ups), a family message board, and emergency alerts.
- **Music** (Melvin, 2026-11-17): Spotify and Sonos controls on the wall, through Home Assistant.
- **Meal planning** (Melvin, 2026-11-17; repeats 2026-11-23): breakfast, lunch and dinner for each day, with optional
  recurring cadences (every weekday, every N days), planned from a phone and shown on the wall (see Architecture).
- **Shopping list** (Melvin, 2026-11-22): groceries the family adds from their phones, shown on the wall, ticked off
  with a tap when the widget allows it (see Architecture).
- **Whiteboard** (Melvin, 2026-11-22): a simple shared doodle on the wall — a few colours, finger draw, eraser, hold
  Clear to wipe; wider tiles show more colours; the same board on every display (see Architecture).
- **Phone edit without login** (Melvin, 2026-11-22: QR to the display link with `/edit`): `/d/<token>/edit/` edits
  meals, shopping and the message board with no magic link; an `editQr` widget and the Displays tab both show the QR
  (see Architecture). Not Google Tasks or a new local to-do list — those stay separate.
- **UV, pollen, school status and who's home** (Melvin, 2026-11-22): the weather widget can show the UV index and the
  highest pollen count Open-Meteo reports; a school widget reads the district page (Langley SD35 by default) for closed,
  delayed or late start; a who's-home widget reads Home Assistant person and device tracker entities and never controls them.
- **Emergency alerts** (Melvin, 2026-11-17): urgent alerts for Langley, the Lower Mainland, BC and Canada (Alert
  Ready/NAAD, Environment Canada weather warnings, DriveBC road events for torrential rain or snow, Earthquakes Canada,
  tsunami and flooding). They show as a **red strip across the top of the screen that can be dismissed**, not a
  full-screen takeover (`config.alerts.banner` sets the lowest severity that gets the strip).
- **BC Hydro power outages** (Melvin, 2026-11-19: "do bc hydro outages and weather alerts"): outages from BC Hydro's
  outage map join the same alert strip and alerts widget (see Architecture). Weather alerts already existed
  (Environment Canada through NAAD, since 2026-11-17), so that half of the ask needed nothing new.
- **Admin changes reach displays by polling** (Melvin, 2026-11-17: "we dont need real time push for now, polling is
  ok"), with **instant refresh on Household** (Melvin, 2026-11-22): visible, online displays ask for the settings
  version every 30 seconds (304 when nothing changed); hidden or browser-offline displays pause, and failed checks back
  off before retrying. Paid households also long-poll `/api/display/config-watch/` and reload as soon as the version
  moves; admins can tap **Refresh displays**. Free keeps the 30-second poll only. State responses carry the release
  version even on `304`s, so a deploy is detected without an extra request or downloading display HTML. No WebSocket.
  The Views tab's live preview is the exception: it shows the unsaved working copy over `postMessage` and never pushes
  that draft to wall screens.
- **Starter view templates** (Melvin, 2026-11-22; expanded 2026-11-23): the Views tab shows ~20 ready-made layouts with
  PNG screenshot previews of the **real display widgets** (`public/templates/`, regenerate with
  `npm run templates:previews` or the **Update template previews** GitHub Action). Sample feeds and photos live in
  `scripts/template-samples/` and `public/templates/samples/`. Free templates use only Free-tier widgets; Household ones
  add productivity, family, holiday, commute and smart-home layouts (`src/lib/config/templates.ts`). Portrait twins
  (`family-hub-portrait`, `kids-routine-portrait`, `playroom-portrait`) use an 8×12 grid for tall tablets.
- **Portrait grid** (Melvin, 2026-11-23): Edit view includes an **8×12 (portrait)** preset; when a view has more rows
  than columns the display letterboxes the stage on a landscape panel (`html.portrait-view`).
- **More theme fonts** (Melvin, 2026-11-22): Outfit, DM Sans and Literata join Inter, Manrope and Space Grotesk
  (self-hosted under `/fonts/`). Built-in themes spread those fonts so starter template previews look distinct.
- **Castable display URL** (Melvin, 2026-11-22; gated 2026-11-23): Displays tab copy/open tips for Chromecast (cast a
  browser tab opened to `/display/`) and TV/kiosk start pages — unlock once with phone QR; no custom Cast receiver.
- **Live views editor** (Melvin, 2026-11-22: the view loaded in the UI, changes live; then one surface with right
  settings drawers, not two stacks): the Views tab shows one live editable layout (real widgets under a drag overlay);
  widget settings and view settings (Edit view) each open in a right slide-out. Draft `postMessage` updates patch cells
  in place (`src/lib/display/viewDiff.ts`) so a setting tweak does not remount every widget.
- **Logo** (Melvin asked for one, 2026-11-17): a rounded blue square holding three panes (a tall white one with clock
  hands, an amber "sun" pane, a pale one), and the wordmark "everyday**pane**" in Manrope 800 with "pane" in the brand
  blue. Sources are SVGs in `public/brand/` (mark, favicon with clock hands, full-bleed apple, maskable, Safari pinned
  silhouette, light and dark wordmarks). `npm run build:icons` (`scripts/build-icons.mjs`) rasterises them into
  `public/icons/` (16–512 PNG, Apple 120/152/167/180, maskable 192/512), `favicon.ico`, `icon.svg`,
  `apple-touch-icon.png` and the Next `src/app/` copies; the root layout, display shell and web app manifest
  (`src/app/manifest.ts`) all point at that set (Melvin, 2026-11-23: favicon and high-res icons for phones and tablets).
- **Today's weather leads** (Melvin, 2026-11-26: "the current weather today is supposed to be bigger … and more
  prominent than the other ones"): the current temperature, icon and condition fill the height the forecast rows leave
  and scale with it (`.wx-now` is its own size container); the hourly and day rows are a smaller, quieter strip. A
  short, wide tile keeps today and the days side by side.
- **Month calendar title** (Melvin, 2026-11-19: "add a toggle to show/hide month title"): the month widget's
  "November 2026" line can be switched off in its settings (`showTitle`, on by default); the grid takes the space.
- **Tile padding** (Melvin, 2026-11-22: "is it possible to adjust the inner padding of the tiles"): each view has a
  **Tile** control next to Gap and Edge (`tilePadding`, 0–48 px, 16 by default) for the space inside each panel;
  photos, cameras and radar still fill their cell.
- **Per-widget background** (Melvin, 2026-11-22: "customize whether each component has a background" and its opacity):
  every widget has Background on/off and Background opacity (`showBackground`, `backgroundOpacity`); opacity falls
  back to the theme's widget background. Clocks and dates start with Background off; an older sunrise & sunset
  "transparent" setting becomes Background off.
- **Per-widget font size** (Melvin, 2026-11-23: scale fonts on a per component basis): text widgets get a Font size
  slider (`fontScale`, 70–150 %, 100 % when omitted). The display sets `--font-scale` on the cell; stylesheet
  `font-size` rules multiply by it. Photos, radar, camera, earth, Windy, TradingView, YouTube, Vimeo, Instagram, Maps and
  the whiteboard omit the control.
- **Per-widget outer padding** (Melvin, 2026-11-23: slider for outer padding on each widget): every widget has Outer
  padding (`outerPadding`, 0–48 px, omitted means none) that insets the panel inside its grid cell; the view's Tile
  padding stays the space inside the panel.
- **B.C. permanent daylight time** (Melvin, 2026-11-22): some display browsers have old time-zone data and move
  `America/Vancouver` back one hour in November. Everydaypane uses Vancouver's historical rules before the March 8,
  2026 transition and fixed UTC−7 after it for clocks, dates, calendars and time-of-day display schedules.
- **Month calendar weeks and weekends** (Melvin, 2026-11-21: "allow users to customize how many weeks to display,
  minimum 1, max is 6", and "allow calendar to hide or show weekends"): the month widget shows the whole month (the
  default, as before) or 1 to 6 weeks starting with this one (`weeks`), and can drop the Saturday and Sunday columns
  (`showWeekends`, on by default). Rolling weeks don't dim the next month's days; its first day reads "Dec 1" and the
  title names both months. The calendar feed covers at least the next six weeks for this. Weeks already started on
  Sunday or Monday (`weekStartsOn`).
- **Month calendar fit titles and scroll** (Melvin, 2026-11-22): event titles wrap (and shrink if needed) so they are
  not cut off with an ellipsis (`fitTitles`, on by default); busy days still use “+N more”. When the grid has more
  week rows than `scrollWeeks` (1 to 6, default 3), each week is sized as if only that many fit the tile and the rest
  scrolls by touch.
- **Commute time** (Melvin, 2026-11-19): drive times with live traffic from home to up to six places (work, school),
  set up in Settings › Commute; a place can have a "be there by" time, and the widget then says when to leave (see
  Architecture).
- **Rain radar** (Melvin, 2026-11-21): an animated radar map for the Lower Mainland, the past hour and a short-term
  forecast, from a free source with no key (see Architecture).
- **Wildfires** (Melvin, 2026-11-21: "do windy and wildfires"): a wildfire map around home with no key: active fires,
  their burned areas and evacuation areas, and the nearest fires listed; nearby evacuation orders and alerts also join
  the alert strip (see Architecture). Windy was the other half of that ask (`windy`, below).
- **Chore chart** (Melvin, 2026-11-21; periods 2026-11-23 from homescreens.dev): recurring chores for the kids, on chosen
  weekdays and a **time of day** (morning, afternoon, evening, anytime), done by everyone picked or rotated between them
  (each time it's due, or a week each), ticked off with a tap on the wall, with per-kid completion dots (or progress rings),
  stars per chore counted per kid for the week and an optional weekly goal. Widget layout: columns, by period, or progress.
  Separate from Google Tasks (see Architecture).
- **River levels** (Melvin, 2026-11-25: "build that all", from a list that included river and creek levels): a
  `rivers` widget with Environment Canada's real-time gauges, rising or falling at a glance. It complements the NAAD
  flood warnings on the alert strip instead of repeating them: the strip says when officials warn, the widget shows how
  high the water is and which way it's going (see Architecture).
- **Kitchen timers and pomodoro** (Melvin, 2026-11-21: "1 with visual and sound alerts", then "i want a regular
  timer, and a separate pomodoro"): two widgets, `timer` and `pomodoro` (see Architecture).
- **DriveBC highway cameras** (Melvin, 2026-11-25: "build that all", from a batch of widget ideas): still pictures
  from DriveBC's public highway cameras, picked by name or highway in the widget's settings, refreshed on a timer like
  the Camera widget and paused under the screen saver; no key (see Architecture).
- **BC Ferries** (Melvin, 2026-11-21): the next sailings for routes chosen in the widget's settings, with how full
  each one is (see Architecture).
- **Border wait times** (Melvin, 2026-11-25: "build that all", from a list naming border waits): a widget with the
  Lower Mainland crossings in both directions from the two agencies' public feeds, no key (see Architecture).
- **Earth wind map** (Melvin, 2026-11-21: "can i add this and specific a location? https://earth.nullschool.net"):
  earth.nullschool.net framed in a widget, centred on a place picked in its settings (Langley by default), with a
  zoom, a colour layer and its own place marker (see Architecture).
- **Windy map** (Melvin, 2026-11-21: "do windy and wildfires", after asking for a weather map like earth's): Windy's
  free embed framed in a widget, centred on a place (Langley by default), with a layer, a zoom, a marker, pressure lines
  and touch off unless switched on (see Architecture). Wildfires are separate work.
- **TransLink departures** (Melvin, 2026-11-19: "add translink"): a TransLink widget with the next buses from up to six
  picked stops, live from TransLink's GTFS-realtime feed (see Architecture).
- **Sports scores** (Melvin, 2026-11-21: "allow to customize the sports and the teams"): any teams from several leagues
  (up to 12), picked in Settings › Sports, with a live score while a game is on, the last result and the next game
  (see Architecture).
- **Screen saver** (Melvin, 2026-11-21): after some minutes with no touch the display shows only photos (full screen,
  optional clock) or goes dark, and during a night window it goes dark; Home Assistant motion sensors keep it awake and
  wake it (see Architecture). Off until switched on in Settings › Screen saver.
- **Airthings indoor air** (Melvin, 2026-11-21: "do all 6", from a list of native cloud APIs; native only, not Home
  Assistant): an Indoor air widget for radon, CO₂, VOC, particles, humidity and temperature, with optional high radon
  and CO₂ on the alert strip (see Architecture). Separate from the outdoor Air quality widget.
- **Oura ring** (Melvin, 2026-11-21: "do all 6", from the list of devices with official cloud APIs): sleep,
  readiness and activity scores on the wall, read directly from Oura's API (not Home Assistant). Scores only unless
  the widget's **Show last night's details** is on, because the kitchen wall is readable by anyone (Claude's default,
  2026-11-25) (see Architecture).
- **EcoFlow power stations** (Melvin, 2026-11-21: "do all 6" of the native integrations; he has five EcoFlow devices):
  battery, solar and power in and out on the wall from EcoFlow's official developer API, not Home Assistant (see
  Architecture). Each household brings its own keys, because EcoFlow keys belong to one EcoFlow account.
- **Internet ping and speed** (Melvin, 2026-11-21: "can we add an internet ping one", "or internet speed"): an
  `internet` widget measured by the wall's own browser, so it shows the home connection (see Architecture). No relay or
  extra software at home.
- **UniFi network health** (Melvin, 2026-11-21: "do all 6", from a list of official cloud APIs; native only, not
  through Home Assistant, nothing running at home): a `unifi` widget with the gateway's own view of the internet from
  UniFi Site Manager. It sits beside the browser-side internet ping widget rather than replacing it (see Architecture).
- **Mountain snow report** (Melvin, 2026-11-25: "build that all", from a list of widget ideas): new snow, depth and
  the next days' snowfall on the local mountains, picked in the widget's settings, from Open-Meteo with no key (see
  Architecture).
- **Rachio sprinklers** (Melvin, 2026-11-25: "build that all", a batch of native integrations): the next watering
  on the wall with a Skip button, from Rachio's official public API with the household's own API key, not Home
  Assistant (see Architecture). Skip is on for a new widget but needs a second tap (Claude's default, 2026-11-25).
- **Blue Riiot pool** (Melvin, 2026-11-26: "Are there APIs for things like blueriiot", then yes to the unofficial
  route): the Blue Connect's readings on the wall from the cloud the Blue Riiot app uses, signed in with the app's
  email and password stored encrypted, because Blue Riiot has no developer API. Unofficial, so it can break; the docs
  say so. Out-of-range alerts are off by default (see Architecture).
- **Tides, moon, aurora and On this day** (Melvin, 2026-11-25: "build that all, and tides, moon phases", from a list of
  keyless widgets): the existing tides widget gained a day curve and a working Canadian station search (White Rock,
  Crescent Beach); the moon is worked out on the device, both as its own widget and as a line on Sunrise & sunset; aurora
  chances come from NOAA's Kp forecast for home's latitude; On this day reads Wikipedia with a family-friendly filter
  (see Architecture).
- **Washer and dryer** (Melvin, 2026-11-25: "build that all", from a list that included washer and dryer done alerts;
  native cloud APIs, not Home Assistant): a `laundry` widget with time left and "done" from LG ThinQ and Samsung
  SmartThings, and a blue "done" notice on the alert strip (see Architecture). Claude's defaults: notices on, "done"
  for three hours unless the next cycle starts.
- **Canadian English** in everything a person reads (colour, centre, favourite), as in Liftsmith.

## Display: super lightweight (rule, Melvin, 2026-11-17)

"Emphasize super lightweight front end for the dashboard so it loads quickly and is responsive. The backend or admin
panel can be complex if you need it to be."

- The unlocked display (`/display/` after wall cookies) is **not a React page**. It is server-rendered HTML plus one
  small TypeScript module bundled by esbuild (`src/display/` → `public/display/`), with no framework. The unlock gate
  (`/display/unlock/`) is a Next.js page. Widgets update only the DOM nodes that change (the clock rewrites one text
  node a second).
- **Widgets that load on their own** (2026-11-25, when display.js passed 40 KB on main): a widget few screens use can
  be built as its own file (`public/display/<name>.js`: add it to `LAZY` in `scripts/build-display.mjs`, a line in
  `bundle-check.mjs` and the `Lazy` type) and mounted through `lazyWidget` (`src/display/widgets/lazy.ts`), which
  imports it with display.js's own `?v=` only on a screen that shows it. Its `../api` is swapped at build time for
  `src/display/apiShared.ts`, which calls display.js's copy, so feeds, the device token and offline state stay single.
  The internet widget, the UniFi network widget, EcoFlow, the whiteboard, wildfires, the Windy map, the Smart device tile
  (`haEntity.ts`; cameras and `HA_EVERY` stay in `ha.ts`), Oura, Indoor air (Airthings), the snow report, River levels,
  Border wait times, Sprinklers (Rachio), Highway cameras (DriveBC), the Pool (Blue Riiot), tides, moon phase, aurora,
  On this day and Laundry load this way, and `next.config.ts` gives each file the same
  immutable cache header as display.js.
- **Budget:** the display's script stays under 80 KB gzipped and its stylesheet under 20 KB (`scripts/bundle-check.mjs`,
  a CI step; CSS raised from 10 KB on 2026-11-23 for more clock styles; script raised from 40 KB by Melvin on 2026-11-25: "double the size of the limit"). A new dependency on the display needs a very good reason.
- All heavy lifting happens on the server: API calls to Google, weather, Recycle Coach, Amazon and Home Assistant are
  made, cached and trimmed by our routes, and the display fetches small JSON. Images are proxied at display size.
- **No zooming** (Melvin, 2026-11-17: "dont allow pinch zoom on the dashboard"; kept after the 2026-11-22 a11y audit):
  the display's viewport meta has `maximum-scale=1,user-scalable=no`, the page has `touch-action: pan-x pan-y`, and
  `main.ts` cancels gesture events, two-finger moves and ctrl + wheel. That blocks WCAG 2.2 **1.4.4 Resize text** and
  **1.4.10 Reflow** on `/d/…` on purpose — a fixed 1920 × 1080 kitchen layout must not pinch-zoom. Treat it as a known
  exception for the wall only; the admin panel and `/family/` still allow zoom. Do not "fix" the lock without Melvin.
- Animations use `transform` and `opacity` only. Backdrop blur ("glass") is off by default because it costs GPU time.
  Timer, pomodoro and alarm flashes honour `prefers-reduced-motion: reduce` (solid danger colour, no blink).
- The admin panel and backend may be as complex as needed (Next.js, React, Zustand).

## Stack (Melvin, 2026-11-17: like Liftsmith and Gradelings)

- Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript 6 (`@typescript/typescript6`), Tailwind 4, Zustand,
  Turso/libsql, zod (server and admin only), Vitest, Playwright, ESLint 10 (`eslint-config-next` plus type-aware rules),
  Prettier (width 140, sorted imports).
- **Latest versions, pinned exactly** in `package.json`; Dependabot keeps them current.
- **Strict TypeScript** plus `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`,
  `noImplicitOverride`. No `any` (lint error). Lint runs with `--max-warnings 0`.

## Architecture

- **Accounts (households)** (`src/server/accounts.ts`): each family has an `accounts` row (plan, Stripe ids) and
  `account_members` (admin|family). Sessions and display devices carry `accountId`. Env `ADMIN_EMAILS` /
  `FAMILY_EMAILS` still seed and open the grandfather household. Public Free signup seeds
  `freeDefaultConfig()` (one Free-safe view, schedule off); Paid / grandfather empty docs still use the full
  multi-view `defaultConfig()`.
- **One settings document per account** (`account_config`; schema in `src/lib/config/schema.ts`, validated with zod on
  every save) holds views, widgets, themes, the schedule and integration settings. It is versioned: a save names the
  version it started from, a stale save is refused with 409, and every save bumps the version displays poll for
  (`src/server/config.ts`). Free saves are plan-gated (`src/server/planGates.ts`).
- **Secrets are not in the document.** Tokens (Google refresh token and its scopes, Amazon cookie, Home Assistant
  token) are stored encrypted (AES-256-GCM, key from `SESSION_SECRET`) in `account_secrets` and never sent to a browser
  (`src/server/secrets.ts`). The WiFi password is the exception: showing it is the widget's job.
- **Database:** Turso in production (`DATABASE_URL` + `DATABASE_AUTH_TOKEN`, or the `TURSO_*` pair Vercel's
  integration creates), `file:local.db` in development, memory in tests. Tables are created on first use; migrations only
  ever add (`src/server/db.ts`).
- **Displays** (Melvin, 2026-11-23: wall behind auth): the kitchen dashboard opens at **`/display/`**, not a public
  `/d/<token>/` capability URL (that path redirects to `/display/`). Unlock with a phone QR (non-touch TVs) or a
  signed-in household member picking the device on the wall; claim sets `ep_wall` + `ep_display` cookies, not a
  household session. Device tokens stay sealed (`token_sealed`); after unlock the HTML still gets `data-token`. Phone
  edit/chores keep `/d/<token>/edit/` and `/d/<token>/chores/`. The Displays tab copies the shared wall gate and the
  phone-edit link; **New link** rotates the token (signs that screen out once cookies no longer match). New tokens are
  case-sensitive 8-character alphanumeric; unique hash collisions are retried (Melvin, 2026-11-21). A device shows one
  view, or follows the time-of-day schedule. Deleting a device signs that screen out.
- **Household panel** (`src/app/household/_ui/`): one page with five destinations on phone and desktop — Views, Colours,
  Displays, Family, Settings (Melvin phone IA 2026-11-24; desktop aligned 2026-11-24 critique). Family holds Schedule /
  Meals / Shopping / Messages behind a sub-strip. Wall settings collect in a working copy and go out with **Publish to
  wall**; Family lists save as you go. The Views tab embeds `/household/preview/<viewId>/` under a transparent drag
  overlay (`src/app/household/_ui/LiveLayoutEditor.tsx`) and pushes the working copy over `postMessage`
  (`src/lib/display/draftMessage.ts`) so layout and widget options update live; wall screens still only reload the saved
  document. The overlay drags with pointer events (mouse and touch), resizes from any of a widget's four corners with
  the opposite corner held still (Melvin, 2026-11-21: "allow any corner of a widget to adjust the size"), and also moves
  and resizes with the keyboard; widgets never leave the grid and never overlap, except that other widgets may sit on
  top of a photos widget (`src/lib/config/grid.ts`). Tapping a widget opens `WidgetSettingsDrawer` from the right; Edit
  view opens `ViewSettingsDrawer` (shared `SlideDrawer` chrome).   Add widget leads with four kitchen recommendations, then intent chips (Today / Family / Home / More) before the full
  catalogue; Free Household widgets stay collapsed behind a count. Starter templates scroll into view with a status note
  when opened under the live preview. Free plan soft-locks (`PlanProvider` in `plan.tsx`) gate Family destinations, paid
  widgets, Household starter templates, and paid Settings groups via Plan chip / blocked controls (not badge rain on idle
  nav); `#upgrade` opens the why-upgrade dialog with Stripe Checkout. Settings jump nav: Home → Everyday (≤4 chips) →
  Advanced. Wall empty states point at Household Settings (not “admin panel”).
- **Platform admin** (`src/app/admin/`, `/api/admin/`): staff-only ops (`src/server/adminAuth.ts`: Clerk session plus
  `ADMIN_EMAILS`); Tuned-style tabs via `/api/admin/[action]/`. Not the household settings UI.
- **Feature flags** (Melvin, 2026-11-26: "feature flags in the admin area for all of these integrations"): one
  registry in `src/lib/featureFlags.ts`, built from `WIDGETS` plus typed records of every smart-home provider, music
  provider, to-do provider and photo source kind, so **a new widget gets a flag automatically** (`widget.<type>`) and a
  new provider or photo source doesn't compile until it has a label there. Staff switch them in `/admin/` › Flags
  (`feature_flags`), platform-wide only: **no per-household overrides** (Melvin, 2026-11-26: widgets still under
  development must not be switched on for one household; the first version's `account_feature_flags` rows are
  ignored). Everything is on by default. Off means: gone from the widget picker, its Settings card hidden (`SETTINGS_FLAGS`, keyed by
  `#settings/<id>`; a new Settings card for an integration adds a line there), and dropped from the display's copy
  of the settings by `applyFlags`. Every `/api/display/*` route reads settings through `loadDisplayConfig`
  (`src/server/featureFlags.ts`), never `loadConfig`, so a switched-off widget isn't drawn, its feed isn't polled
  and the server never calls the service; routes that don't read settings check `featureOn`. The household's saved
  document is never changed, so turning a flag back on restores it. A switch bumps the settings version of the
  households whose settings mention that widget, provider or source, so their walls reload. The display bundle has
  no flag code.
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
  `on`, the screen counts as in use. "Dark" is a black screen: a browser can't switch a panel's backlight off.
  An admin's preview never shows the saver.
- **Family message board:** anyone on `ADMIN_EMAILS` or `FAMILY_EMAILS` posts notes from `/family/`; the author name is
  typed, never the email, because the wall is readable by anyone in the kitchen. Notes can expire; admins pin. Displays
  poll the board every 30 seconds with an ETag. The kitchen edit page (`/d/<token>/edit/`) can post too (no pin).
- **Family calendar events** (Melvin, 2026-11-22): dentists, concerts and the like posted from `/family/` live in
  `family_events` (`src/server/familyEvents.ts`) and merge into the same five-minute calendar feed as Google and iCal
  links (colour `#5b8def`, calendar "Family"). `/api/family-events/` serves the phone UI; authors and admins can delete.
- **Whiteboard** (Melvin, 2026-11-22: "a very simple whiteboard", colours + finger + eraser, same doodle on every
  display, hold Clear, wider tile → more colours): one shared board in the `whiteboard` table
  (`src/server/whiteboard.ts`), strokes on a fixed 1600×900 board so every tile letterboxes the same doodle. Displays
  poll `/api/display/whiteboard/` every three seconds; a stroke posts on finger-up and Clear posts after an 800 ms hold.
  No brush sizes, undo or sync from phones.
- **Meal planning** (Melvin, 2026-11-17: "add meal planning"; repeats Melvin, 2026-11-23: cereal every Monday, eggs
  every Tuesday, every N days): one-off rows in `account_meals` and recurring rules in `account_meal_rules`
  (`src/server/meals.ts`), planned by anyone on `ADMIN_EMAILS` or `FAMILY_EMAILS` from the admin panel's Meals tab or
  `/family/`, or from `/d/<token>/edit/` with the display token. A meal saves when its box loses focus (not with the
  settings Save button, since it isn't part of the settings document); a Repeat control sets a weekday cadence or every
  N days (1–14), and rules expand at read time into the week the planner and wall see. A one-off for that day wins; clearing
  a rule-filled day stores a skip for that day only; Stop removes the series. Recent meals (including rule text) are
  offered as suggestions. The meals widget shows one day (the next meal highlighted; from 8 PM it shows tomorrow,
  `nextMeal` in `src/lib/meals.ts`) or up to a week, and polls `/api/display/meals/` every minute. One-off plans older
  than 60 days are cleared as new ones are written.
- **Shopping list** (Melvin, 2026-11-22): one row per item in the `shopping` table (`src/server/shopping.ts`), added by
  anyone on `ADMIN_EMAILS` or `FAMILY_EMAILS` from `/family/` or the admin panel's Shopping tab, or from
  `/d/<token>/edit/`. Open items stay in the order they were added; bought ones drop off after 7 days, and the open
  list stops around 100. "Add from this week's meals" copies each distinct meal for the next seven days that isn't
  already open. Displays poll `/api/display/shopping/` every minute with an ETag. A tap on the wall ticks an item off
  at once (a second tap puts it back) only when a shopping widget has `allowCheck`, because anyone in the kitchen can
  reach the screen; a signed-in phone (or the kitchen edit link) can always tick. The widget shows a chosen number of
  items and can show or hide what's already bought.
- **Phone edit page** (Melvin, 2026-11-22): `/d/<token>/edit/` reuses the family meal, shopping and message components
  with no magic link (`FamilyAuthProvider` sends `x-display-token`; `familyEditorFor` in `src/server/familyAuth.ts`
  accepts a session or that token). Kitchen posts are keyed `display:<deviceId>` (no admin pin). An `editQr` widget and
  the Displays tab (copyable `editUrl` plus `/api/household/devices/<id>/edit-qr/`) both encode that URL. Knowing the
  display link is the capability — keep the QR on the wall, not shared online. Family calendar events stay on `/family/`
  only.
- **Kids chores phone** (Melvin, 2026-11-23): `/d/<token>/chores/` and `/family/chores/` (`KidsChores`, `/api/family/chores/`)
  let a kid pick their name, tick today's chores by period, and redeem star rewards. Same display-token or family session
  auth as the edit page; ticks skip the wall's `allowCheck` gate. Parents still edit people and chores in Settings › Chores;
  uncheck and redeem still need the child PIN when set.
- **School status** (Melvin, 2026-11-22): `src/server/school.ts` reads `config.school.statusUrl` (https only, never a private
  address), cached five minutes, and looks for closed, delayed or late start in the page's alert or notification banner,
  then in the rest of the page. Anything else is open. A widget can name schools; a notice counts when it names one of
  them or says all schools. Displays poll `/api/display/school/`. The district name and page are Settings › School status
  (Langley School District, sd35.bc.ca, by default).
- **Who's home** (Melvin, 2026-11-22): presence widgets list Home Assistant person and device tracker entities. Those ids
  are added to `usedEntities().all` and never to `controls`, so the wall can show home or away and cannot change them.
  The widget uses the same five-second Home Assistant feed as the other tiles.
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
  fails never hides Google's events or the other links. Only public https addresses are fetched (including after redirects).
- **TransLink:** departure times come only from the GTFS-realtime trip updates
  (`gtfsapi.translink.ca/v3/gtfsrealtime`, key in `TRANSLINK_API_KEY` in Vercel), decoded by a small hand-written
  protobuf reader (`src/server/gtfs.ts`, no protobuf dependency). Route numbers, headsigns and the stop list come from
  the static GTFS zip, read with HTTP range requests (only `routes.txt`, `trips.txt`, `stops.txt`; never
  `stop_times.txt`) and cached three days. A widget stores its stops (`id`, the stop number on the sign, name), so only
  stops on widgets are kept from the region-wide feed. One 30-second read of TransLink is shared by every display
  (`/api/display/transit/`, polled every 30 seconds); the wall counts minutes down from absolute times between reads.
  TransLink's licence notice is shown in the widget's settings and as "Live times from TransLink" on the wall.
  Setup: `docs/translink.md`.
- **Alert email:** when `config.alerts.notifyEmail` is on, each new strip-worthy alert (`meetsBanner` in `src/lib/alerts.ts`)
  triggers one email per alert id to household members (`src/server/alertNotify.ts`, `sendEmail` through Resend, HTML from
  `alertEmail` in `src/lib/email.ts`); ids are stored in `account_alert_notified` so repeats are never sent. The display
  alerts route calls this after each feed read.
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
  get them only through `/api/display/photo/`. Removing a library album deletes its photos when the settings are saved
  (Undo before Save keeps them). Setup: `docs/google-photos.md`.
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
- **Wildfires:** BC Wildfire Service's public ArcGIS feature services on ArcGIS Online
  (`services6.arcgis.com/ubm4tcTYICKBpist/…`, no key, the layers its Wildfire Situation map reads):
  `BCWS_ActiveFires_PublicView` (points; `FIRE_STATUS` is the stage of control: New, Out of Control, Being Held, Under
  Control, Out), `BCWS_FirePerimeters_PublicView` (polygons) and EmergencyInfoBC's `Evacuation_Orders_and_Alerts`
  (polygons for any hazard; `ORDER_ALERT_STATUS` Order, Tactical Evacuation, Alert; the layer itself hides All Clear)
  (`src/server/wildfires.ts`). Claude's pick (2026-11-21) over CWFIS, which is national and slower to update. Each
  query asks only for the radar's 5 × 5 tile square around home at the widget's zoom (envelope in EPSG:3857, fires that
  aren't Out), and polygons come simplified to one map pixel (`maxAllowableOffset`). The server turns everything into
  pixels on that map (fires as points, outlines as SVG path data), cached five minutes per zoom for every display, so a
  display never gets coordinates; the tiles are the radar's (`/api/display/radar/tile/`). The fires failing shows
  "unavailable"; the outlines failing only drops the outlines. The widget loads on its own (`public/display/wildfires.js`, `src/display/widgets/lazy.ts`), so screens without it
  never fetch it. It is one SVG over the tiles, redrawn when the
  feed (`/api/display/wildfires/`, every five minutes) or night mode changes; nothing animates. Colours follow BC
  Wildfire Service's map: red out of control or new, amber held, green under control, a black ring for a fire of note.
  The alert strip reads the same evacuation layer in EPSG:4326 around home (`parseEvacuations` in
  `src/server/alerts.ts`): an order covering the home is extreme and an alert severe; within `alerts.evacuationKm`
  (default 10 km) they are moderate and minor. This sandbox can't reach ArcGIS Online, so tests use shapes from the
  layers' descriptions and sample features read on 2026-11-21.
- **Mountain snow report:** `src/server/snow.ts` asks Open-Meteo's forecast API once for every mountain on any snow
  widget (comma-separated `latitude`/`longitude`/`elevation`, answered as an array), with `hourly=snowfall,snow_depth`,
  `daily=snowfall_sum`, the current temperature, `past_days=1` and the dashboard's time zone. The mountains, their
  coordinates and a mid-mountain elevation (so snowfall isn't the model's smoothed valley height) are in
  `src/lib/snow.ts`. New snow is the last 24 hourly stamps up to now, depth the latest past `snow_depth`, and the
  forecast today and the next two local days. Cached 30 minutes, keyed by time zone and mountains only (public data, so
  households share it); amounts travel in centimetres and the wall converts to inches, the server converts the
  temperature. These are model numbers, not the resorts' reports (resorts publish only web pages), so the widget says
  "Model estimate". Displays poll `/api/display/snow/` every 15 minutes; the widget loads on its own (`snow.js`).
- **River levels:** `src/server/rivers.ts` reads Environment Canada's real-time hydrometric data, no key: MSC GeoMet's
  OGC API (`api.weather.gc.ca/collections/hydrometric-realtime/items?STATION_NUMBER=…&datetime=<30 h ago>/..`,
  properties `STATION_NAME`, `DATETIME`, `LEVEL`, `DISCHARGE`), and when that fails the Datamart's hourly CSV for the
  station (`dd.weather.gc.ca/today/hydrometric/csv/BC/hourly/BC_<id>_hourly_hydrometric.csv`, then the older path
  without `today/`; columns found by header). Claude's pick of source, 2026-11-25. Each station is cached ten minutes
  and shared by every household. The maths is in `src/lib/rivers.ts`: the change over 6 and 24 hours against the
  reading nearest that time, under 1.5 cm in 6 h is steady, and 24 hourly levels for the line. Displays poll
  `/api/display/rivers/` every five minutes and get names and numbers in metres and m³/s; the wall converts for
  imperial and draws a near-flat day flat. A widget keeps up to six stations (`id` like `08MH024`, optional `label`);
  Settings offers presets and checks a typed number through `/api/household/river-stations/`. Levels are above each
  gauge's own zero, so they compare a river with itself only. The widget loads on its own (`rivers.js`). This sandbox
  can't reach either host, so tests use the shapes in MSC's documentation.
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
- **DriveBC highway cameras** (`src/server/drivebc.ts`, setup `docs/drivebc.md`): the Ministry of Transportation's
  public cameras under the Open Government Licence – British Columbia, no key. The camera list and status come from
  DriveBC's own site feed (`www.drivebc.ca/api/webcams/`, cached ten minutes, parsed leniently since it has no
  published schema: `is_on`, `marked_stale`/`marked_delayed`, `last_update_modified`, GeoJSON `location`); the older
  `images.drivebc.ca/webcam/api/v1` is abandoned (months-old readings) and isn't used. The widget settings' search
  (`/api/household/drivebc/`, name, place, "hwy 1" or id, nearest home first) falls back to the BC Data Catalogue's
  monthly `webcams.csv` when the site feed fails. A widget keeps up to four cameras as `{ id, name }`. Pictures are
  `www.drivebc.ca/images/<id>.jpg` (the old `bchighwaycam/pub/cameras/` addresses broke when DriveBC moved them),
  served through `/api/display/drivebc/image/?c=<id>` only for cameras on the household's widgets, checked to be a
  JPEG and kept a minute in memory for every display; the service worker leaves them alone. Displays poll
  `/api/display/drivebc/` every five minutes for each camera's last new picture and state (`ok`, `late` when DriveBC
  marks it or it hasn't changed in 20 minutes, `off`). The widget loads on its own (`drivebc.js`), swaps each picture
  in only once it has loaded, fetches nothing while the screen saver is up or the page is hidden, and in "one at a
  time" loads only the camera on screen. The wall credits "DriveBC · OGL-BC"; the settings carry the licence line.
  This sandbox can't reach drivebc.ca, so tests use the catalogue CSV's published header and DriveBC's field names.
- **Border wait times:** `src/server/border.ts` reads CBSA's "Current Border Wait Times" open data
  (`www.cbsa-asfc.gc.ca/bwt-taf/bwt-eng.csv`, semicolon-separated, columns found by header; "Travellers Flow - Canada
  bound" is the Canada-bound car wait, written "No Delay", "N minutes", "Not Applicable" or "--", with times like
  "2026-11-25 14:48 PDT") and U.S. CBP's JSON (`bwt.cbp.gov/api/bwtnew`, every port; `passenger_vehicle_lanes`
  `standard_lanes` and `NEXUS_SENTRI_lanes`, `operational_status` "delay", "no delay", "Lanes Closed", "Update
  Pending" or "N/A", times like "At 3:00 pm PST" on the port's `date`). Crossings and their ids are in
  `src/lib/border.ts`: CBSA calls Peace Arch "Douglas"; CBP's 300401 is Pacific Highway, 300402 Peace Arch, 302301
  Lynden (Aldergrove), 300901 Sumas, 300403 Point Roberts. Each agency is read at most every five minutes for every
  household, trimmed to those crossings before caching; one failing never hides the other and the last good copy is
  served. Displays poll `/api/display/border/` every five minutes; the widget loads on its own (`borderWait.js`) and
  greys out readings older than two hours, since both agencies update about hourly. This sandbox can't reach either,
  so tests use the shapes read on 2026-11-26.
- **Earth wind map:** earth.nullschool.net (Cameron Beccario's site) in an `<iframe>`; checked 2026-11-21: it sends no
  `X-Frame-Options` or `frame-ancestors`, and its script handles being framed itself (it blocks only a few named
  sites, hides its app banner and uses its lighter 1° data in a frame). Everything it shows is set by the address's
  hash (`#current/wind/surface/level/overlay=…/orthographic=lon,lat,scale/loc=…/anim=off`), built by `earthUrl` in
  `src/lib/earth.ts`; its scale is the globe's radius in pixels, so the widget's zoom (globe, continent, region, local)
  is a multiple of the cell's short side. The place is stored on the widget (`place` label, `latitude`, `longitude`),
  found by name through `/api/household/places/` (Open-Meteo's free geocoding, `src/server/places.ts`) or copied from the
  dashboard's location, and sent to earth rounded to two decimals. Earth's wind lines are the heaviest thing a screen
  can run (a load is about 600 KB; it animates on the GPU), so the frame exists only while it can be seen: it is
  removed while the screen saver is up (`html.saving`) or the page is hidden, made again on waking, and made again
  every hour for new weather (earth reads data only when it loads). The frame is sandboxed (`allow-scripts
  allow-same-origin`: no pop-ups or navigating the dashboard), sends no referrer, and takes no touches
  (`pointer-events: none`), so a tap neither spins the globe nor goes unheard by the screen saver. The CSP's
  `frame-src` allows `'self'` (admin live preview) and earth.nullschool.net. This sandbox can't reach earth, so tests
  check the address and the frame's life, not earth itself.
- **Windy map:** Windy's free embed (`https://embed.windy.com/embed.html?…`, no key or sign-up) in an `<iframe>`,
  built by `windyUrl` in `src/lib/windy.ts` with the parameter names Windy's own configurator
  (`embed.windy.com/config/map`) writes: `overlay`, `zoom` (3–11), `lat`/`lon` and `detailLat`/`detailLon` (the place,
  rounded to two decimals), `marker`, `pressure` (never with radar or satellite), `message` left empty to hide Windy's
  promotional line, `product` (`ecmwf`; `cams` for PM2.5) and units from the dashboard's `units` (°C, km/h, mm or °F,
  mph, in). The place is stored on the widget and found like the earth map's. The frame uses `mountIframe`
  (`src/display/widgets/iframeMount.ts`): removed while the screen saver is up or the page is hidden, made again on
  waking and every 30 minutes for new radar and forecasts; sandboxed (`allow-scripts allow-same-origin`), no referrer,
  and no touches (`pointer-events: none`) unless `interactive` is on, when touches on the map pan and zoom it but don't
  count as use for the screen saver. The CSP's `frame-src` allows embed.windy.com. This sandbox can't reach Windy, so
  tests check the address and the frame's life, and preview screenshots use a stand-in (`public/templates/samples/windy.html`).
- **Settings backup and restore** (Melvin, 2026-11-21): Settings › Backup downloads the whole settings document as
  `everydaypane-settings-<date>.json` and restores one (`src/server/backup.ts`, `/api/household/backup/`). The file is the
  document itself, walked generically, so new widget types and settings are in it with no change there. It never holds
  the `secrets` table (tokens, cookies, calendar link addresses), display devices, meals, messages or library photos;
  the file says so in `notIncluded`. WiFi passwords (the one secret in the document) are blanked unless the admin
  switches them on, and a restore without them keeps the dashboard's current ones. A restore is checked first
  (`dryRun`, the panel shows what the file holds), upgraded like a stored document, and saved as an ordinary versioned
  save, so displays reload and a stale restore gets 409.
- **Internet ping and speed:** run entirely on the display, no server (`src/display/widgets/internet.ts`, arithmetic in
  `src/lib/internet.ts`), because only the screen at home can see the home connection; our server on Vercel would
  measure Vercel's. It talks to Cloudflare's speed test servers (`speed.cloudflare.com/__down?bytes=N` and `/__up`,
  the ones its own speed test page uses; they answer any origin, need no key and have a Vancouver location), so the
  CSP's `connect-src` allows that host. A check is three pings one after another and keeps the middle one; two failed
  checks in a row is Offline, one ping above `slowMs` is Slow. A speed test downloads 1, 10 then 50 MB and stops at the
  first that takes a second (about 11 MB on a slow line, 61 MB on a fast one), timed from the first byte; upload is
  0.5, 2 then 10 MB, with the ping taken off. Tests run every `speedHours` (6 by default; 0 = only on a tap), never
  within a minute of the widget starting, half an hour after a failure, and never alongside a ping. Readings live in
  localStorage (`everydaypane.internet.<id>`), so reloads and settings saves don't empty the graph or start an early
  test. Each screen with the widget measures for itself. This sandbox can't reach Cloudflare, so tests use a stand-in.
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
    fixed set of actions per domain (`serviceFor`). Who's-home entities are read and never controlled. **Locks can be
    locked, never unlocked** (Melvin, 2026-11-22), because anyone in the kitchen can tap the screen. States are one
    five-second feed shared by every tile, the doorbell and who's home.
  - UniFi Protect cameras and the doorbell come through Home Assistant's UniFi Protect integration, because Protect
    itself is only on the local network. Camera pictures go through `/api/display/camera/` (snapshots from
    `camera_proxy`, refreshed on a timer, never a video stream, which would be heavy for a low-power wall panel).
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
- **Nest, ecobee and SmartThings without Home Assistant** (Phase 4, Household): a Smart device widget's `provider`
  picks Home Assistant (default), Nest, ecobee or SmartThings. OAuth and refresh tokens live like Music
  (`src/server/smartHomeAuth.ts`); device states merge into the same five-second `/api/display/ha/` feed as HaEntity rows
  keyed `nest.*`, `ecobee.*`, `smartthings.*` (`src/server/smartDevices.ts`). Only entities on a widget can be controlled;
  locks are **lock only** on SmartThings. Nest needs Google Device Access (`NEST_PROJECT_ID`, paid subscription).
  Setup: `docs/nest.md`, `docs/ecobee.md`, `docs/smartthings.md`.
- **Oura** (`src/server/oura.ts`, `/api/display/oura/`, setup `docs/oura.md`): Oura removed personal access tokens in
  December 2025, so an admin connects through an Oura API application (`OURA_CLIENT_ID` / `OURA_CLIENT_SECRET`,
  redirect `<site>/api/oura/callback/`, scope `daily` only). Oura's refresh tokens are **single use**, so the access
  token is stored encrypted next to the refresh token (`oura.accessToken`, `oura.refreshToken`) and shared by every
  server instance; each instance refreshes at most once at a time, and a refused refresh first checks whether another
  instance already stored a newer pair before calling the ring disconnected. The feed reads `daily_sleep`,
  `daily_readiness`, `daily_activity` and `sleep` for the last three days (the ring syncs only when the phone app
  opens), keeps the newest scored day up to today in the dashboard's time zone, and is cached 15 minutes per household;
  parsing is lenient. The night's details come from that day's `long_sleep` period and leave the server only when an
  Oura widget in the household's views has `showDetails` on. A 403 means the ring's membership has lapsed and the
  widget says so. This sandbox can't reach Oura, so tests use shapes from Oura's documentation.
- **Govee lights** (Melvin, 2026-11-21: "do all 6", Govee one of them; native cloud APIs, not Home Assistant): a Smart
  device widget with `provider: "govee"` drives a light through Govee's official developer API
  (`openapi.api.govee.com/router/api/v1`, `src/server/govee.ts`) with the household's own API key from the Govee Home
  app (encrypted `govee.apiKey`, checked with Govee before it is saved in Settings › Smart home). Lights are `govee.*`
  rows on the same `/api/display/ha/` feed, with `color` (#rrggbb) and `scenes` (names only; the server keeps what each
  sends). Actions `color` (RGB number) and `scene` (by name) join `HA_ACTIONS`; only lights on a widget, and only
  capabilities the device lists, are sent. Govee's rate limits (30 state reads a minute per light, a reported 10,000 a
  day per key) mean states are kept per light for `stateEveryMs` (a minute, longer with many lights, about 6,000 reads
  a day at most), the device list 10 minutes and scenes a day; a tap updates the kept state at once. Setup: `docs/govee.md`.
- **Philips Hue and LIFX lights** (Melvin, 2026-11-25: "build that all", Hue and LIFX beside Govee; native cloud APIs,
  not Home Assistant): Smart device providers `hue` and `lifx`, as `hue.*` / `lifx.*` rows on the same `/api/display/ha/`
  feed with on/off, brightness and `color` (no scenes). **Hue** (`src/server/hue.ts`) uses the Remote API: OAuth through
  `smartHomeAuth.ts` with Everydaypane's developers.meethue.com app (`HUE_CLIENT_ID` / `HUE_CLIENT_SECRET`, callback
  `<site>/api/smart-home/hue/callback/`), then CLIP v2 through `api.meethue.com/route/clip/v2/` with a bridge application
  key the server makes once through the cloud (remote link button, then `POST /route/api`; encrypted `hue.appKey`,
  remade if the bridge refuses it). **LIFX** (`src/server/lifx.ts`) uses `api.lifx.com/v1` with the household's personal
  access token (encrypted `lifx.token`, checked with LIFX before it is saved in Settings › Smart home). Each reads every
  light in one call, kept 15 seconds per household and shared by every display (LIFX allows 120 a minute); a tap updates
  the kept state at once. Colour conversions (RGB ↔ Hue's CIE xy, LIFX hue/saturation → RGB) are in
  `src/lib/lightColour.ts`. The display needed no new code beyond treating both as lights (`LIGHT_PROVIDERS`), so the
  lazy `haEntity.js` tile draws them. Setup: `docs/hue.md`, `docs/lifx.md`.
- **UniFi network** (Household): Ubiquiti's official, read-only **Site Manager API** (`https://api.ui.com/v1/…`,
  header `X-API-Key`) through `src/server/unifi.ts`. The key is made at unifi.ui.com › API and saved from Settings ›
  UniFi network (`/api/household/unifi/`), which checks it by listing sites before storing it as the encrypted
  `unifi.apiKey` secret; it never comes back to a browser and never goes in a URL. Two reads per household, shared by
  every widget and display: `/v1/sites` (+ `/v1/hosts` for console names, since sites are usually "Default") every
  minute for counts, ISP and gateway offline, and `/v1/isp-metrics/5m?duration=24h` every five minutes for latency,
  packet loss, uptime, downtime and throughput. Displays poll `/api/display/unifi/` every minute and get names and
  numbers only (no IP or MAC addresses): per site, status `ok` or `down` (gateway offline to the cloud, or the latest
  fresh reading under 50 % uptime), the latest reading if under 20 minutes old, 24 h downtime minutes and last outage,
  and 48 half-hour latency averages for an SVG sparkline. "Slow" is decided on the wall from the widget's `slowMs`
  (default 100) or 2 % packet loss. Metrics failing never hides the counts; parsing is lenient because Ubiquiti's
  examples have shifted between the early-access and v1 versions. This sandbox can't reach api.ui.com, so tests use the
  documented shapes. Setup: `docs/unifi.md`.
- **Airthings** (2026-11-21, Household): `src/server/airthings.ts` reads the official consumer API
  (`accounts-api.airthings.com/v1/token`, client credentials with `read:device:current_values`; then
  `consumer-api.airthings.com/v1/accounts`, `/accounts/<id>/devices` and `/accounts/<id>/sensors?unit=metric`). Each
  household makes its own API client on dashboard.airthings.com and pastes it in Settings › Indoor air
  (`/api/household/airthings/`), which checks it with Airthings before saving the pair as secrets
  (`airthings.clientId`, `airthings.clientSecret`); no Vercel variable. Access tokens stay in memory, never in the
  cache table. Sensors are read every 5 minutes per household (the API allows about 120 an hour) and device names
  hourly, shared by every display through `/api/display/airthings/`. Levels come from Airthings' own bands on the
  metric value (`src/lib/airthings.ts`: radon red from 150 Bq/m³, CO₂ from 1,000 ppm, VOC from 2,000 ppb, PM from
  25 µg/m³), then imperial dashboards get °F and pCi/L; the display only paints the level. `recorded` comes without a
  zone and is UTC. Bluetooth-only Waves upload only through a hub or the phone app, so the widget shows "Last reading …"
  after three hours. Indoor alerts (`indoorAlerts`, source `indoorAir`, "moderate", id per device, kind and day) are
  merged into the alerts route only when switched on; readings older than six hours never raise one. This sandbox
  can't reach Airthings, so tests use the documented shapes. Setup: `docs/airthings.md`.
- **Laundry** (`src/server/laundry.ts`, `/api/display/laundry/`, setup `docs/laundry.md`): LG's official ThinQ Connect
  API with a personal access token from connect-pat.lgthinq.com (encrypted `lg.token`, checked with LG before it is
  saved from Settings › Laundry, `/api/household/laundry/`), sent with the headers LG's own SDK (pythinqconnect) sends:
  `x-country`, a fresh `x-message-id`, a stable per-household `x-client-id`, LG's public app `x-api-key` and
  `x-service-phase: OP`, to `api-{aic|eic|kic}.lgthinq.com` by the account's country (`integrations.smartHome.laundry.country`).
  Samsung machines come from the existing SmartThings connection (washer/dryer operating-state capabilities, and the
  `samsungce.*` ones for minutes left and progress). One read a minute per household for every display. Machines rarely
  say "done" for long, so each cycle is remembered in `laundry_state`: running then stopped is done (at the cycle's due
  end if that passed, else now) until the next cycle or `doneMinutes`. Done notices ride the alerts route as
  `source: "laundry"`, `notice: true`, id per machine and `sent` = done time (so each cycle can be dismissed once); the
  strip shows notices whatever `alerts.banner` is, in blue, and `notifyNewStripAlerts` and the Alerts widget skip them.
  The widget loads on its own (`laundry.js`). This sandbox can't reach LG or SmartThings, so tests use documented shapes.
- **Rachio** (`src/server/rachio.ts`, setup `docs/rachio.md`): Rachio's public API (`api.rach.io/1/public`,
  `Authorization: Bearer <key>`) with the household's API key from the Rachio app (encrypted `rachio.apiKey`, checked
  with `person/info` before Settings › Sprinklers saves it through `/api/household/rachio/`). One read of
  `person/<id>` (controllers, zones, schedule rules, rain delay) and each controller's `device/<id>/scheduleitem` (the
  next two weeks, fields read leniently because Rachio doesn't document them) every 10 minutes per household, inside
  Rachio's 1,700 calls a day. Displays poll `/api/display/rachio/` every five minutes and get names, times, minutes and
  zone names only (never rule ids or the key). A wall skip (`POST`, controller and start) is accepted only for the
  watering the feed currently calls next and only when a Sprinklers widget with `allowSkip` shows that controller:
  `schedulerule/skip` for a fixed schedule, else (Flex, or Rachio's "not supported for 3.0 API") a rain delay ending a
  minute after that watering. Skips are remembered in the cache table so the wall moves on even if Rachio still lists
  the run. The widget loads on its own (`rachio.js`). This sandbox can't reach Rachio, so tests use community shapes.
- **Blue Riiot** (`src/server/blueRiiot.ts`, setup `docs/blue-riiot.md`): no official API, so the app's own cloud
  (`api.riiotlabs.com/prod`), as pyblueriiot and Home Assistant's blueconnect component use it. `POST /user/login`
  with the household's app email and password (encrypted `blueRiiot.email` / `blueRiiot.password`, checked with a
  fresh sign-in before Settings › Pool saves them through `/api/household/blueriiot/`) returns short-lived AWS
  credentials, kept in memory only; every read is a `GET` signed with AWS Signature V4 (`eu-west-1`, `execute-api`,
  `signV4`, checked against AWS's published test vectors). Pools and their Blue Connect serials are cached six hours,
  `lastMeasurements?mode=blue_and_strip` 15 minutes per household. Levels come from each reading's own `ok_min`/
  `ok_max` and `warning_low`/`warning_high`, filled from fallbacks for pH, ORP and chlorine (`src/lib/blueRiiot.ts`);
  ok, warn, bad or none. Displays poll `/api/display/blueriiot/` every five minutes and get pool names and readings in
  the dashboard's units (°F for imperial). Pool alerts (`poolAlerts`, source `pool`, "moderate", id per pool, kind and
  day) join the alerts route only when switched on, only for "bad" pH, ORP, chlorine or salinity under six hours old.
  The widget loads on its own (`blueRiiot.js`). This sandbox can't reach Blue Riiot, so tests use community shapes.
- **Tempest, Weather Underground and Nutrislice** (Phase 4, Household): Tempest and WU station settings in
  `config.integrations.smartHome`; Tempest token and optional WU key in secrets. **Menus** widget reads Nutrislice JSON
  only (`src/server/menus.ts`), never the `meals` table.

- **Tides** (`src/server/tides.ts`, reworked 2026-11-25): Canadian stations are `iwls:` plus the five-digit number on
  the tide tables (White Rock `iwls:07577`); IWLS's data route wants its own id, looked up once a day via
  `/stations?code=`, and answers a bare list, so highs and lows are told apart by their neighbours. The old default
  `iwls:8320` (not a real number) is read as Point Atkinson `07795`. The day curve (`showCurve`) is NOAA's 30-minute or
  IWLS's `wlp` predictions resampled to 49 half-hour points from two hours ago, fetched only for stations on a widget
  with it on; the wall draws one SVG path and moves only the "now" line. Settings search both countries through
  `/api/household/tide-stations/` (IWLS's full list kept a day). Times on the wall are formatted in the dashboard's zone.
- **Moon phase** (`src/lib/moon.ts`): new and full moons from Meeus ch. 49 (to a minute or two), phase as the fraction
  between them, illumination from the phase; no feed and no coordinates, drawn for the northern hemisphere. Full moon
  names follow the Old Farmer's Almanac list, with the Harvest Moon the one nearest the September equinox and the
  Hunter's Moon after it.
- **Aurora** (`src/server/aurora.ts`, `src/lib/aurora.ts`): NOAA SWPC's `noaa-planetary-k-index-forecast.json` (no
  key; header-row and object shapes both read), cached 30 minutes for every household. "Tonight" is the next run of
  three-hour blocks whose middle is between 6 PM and 6 AM local. The chance uses home's magnetic latitude (dipole pole
  80.8° N, 72.7° W) and the rule of thumb that the oval's edge is at 68° − 2 × Kp: at it or north is good, within 3° is
  possible (low on the horizon), within 5° slim (a phone camera). For Langley that is Kp 7, 5.3 and 4.3 (Claude's pick,
  2026-11-25). Displays get only Kp numbers and the chance, never coordinates.
- **On this day** (`src/server/onThisDay.ts`): `en.wikipedia.org/api/rest_v1/feed/onthisday/<selected|births>/MM/DD`
  with a User-Agent naming the site, cached 12 hours per date and kind for everyone. The family-friendly filter is a
  word list (wars, disasters, crimes…) that errs on dropping; if it drops every event the births are shown instead. The
  day's order is a shuffle seeded by the date, so every screen shows the same items until midnight.
- **EcoFlow** (`src/server/ecoflow.ts`): EcoFlow's IoT Developer Platform with the household's own access key and
  secret key (encrypted `ecoflow.accessKey` / `ecoflow.secretKey`, saved from Settings › EcoFlow through
  `/api/household/ecoflow/`; never in Vercel env, since a key sees one EcoFlow account's devices). Requests are signed:
  HMAC-SHA256 (hex) with the secret key over the parameters sorted by name, then `accessKey`, `nonce` and `timestamp`,
  sent as headers with `sign`. Keys work only on their region's host, so `api-a`, `api-e` and `api.ecoflow.com` are
  tried in turn and the one that answers is cached with the device list (ten minutes). Each device's
  `/iot-open/sign/device/quota/all` is cached a minute, only for serials on an EcoFlow widget (none picked means all,
  eight at most); one failing device shows offline without hiding the others. Quota names differ by product line
  (`pd.*`/`inv.*`/`mppt.*` with solar in tenths of a watt, `pow*`/`cms*` on the 3-series, `20_1.*` PowerStream,
  `2_1.watts` Smart Plug), so each reading is the first name a device reports; EcoFlow's 5999-minute "unknown" is
  dropped. Displays poll `/api/display/ecoflow/` every minute and never see keys; the widget loads on its own (`ecoflow.js`). This sandbox can't reach EcoFlow, so
  tests use shapes from its documentation and open-source clients. Setup: `docs/ecoflow.md`.

## Security

- **Sign-in with Clerk** (Melvin, 2026-11-24; replaced Resend magic links): email one-time codes via `@clerk/nextjs`.
  After Clerk auth, `requestSession` resolves Turso `account_members` (and env bootstrap lists) to admin|family.
  Platform `/admin/` uses the same Clerk session, then `ADMIN_EMAILS`. A second factor, if wanted,
  is turned on in Clerk; this app does not gate on it (Melvin, 2026-11-25). Nothing a request writes can add someone
  to those staff lists. CI uses `AUTH_TEST_MODE=1` and `ep_test_session` instead of Clerk.
- **Wall unlock with your phone** (Melvin, 2026-11-23: QR is for the display, not household `/signin/` — Tuned-style
  code relay; kept through the Clerk migration; indefinite once unlocked Melvin, 2026-11-24): `/display/unlock/` shows
  a QR and eight-character code (`device_sign_ins`, 10 minutes). The phone opens `/signin/phone/`, signs in with Clerk
  (or test mode) if needed, **picks which display**, and taps Approve; the wall polls and claims `ep_wall` +
  `ep_display` for that device. Unlock lasts until **New link** or the display is deleted (`DISPLAY_COOKIE_MS` is years;
  `/display/` re-issues cookies on each load). Signed-in browsers on the wall can pick a display without QR
  (`POST /api/auth/device/select/`). Codes and poll secrets are stored only as hashes; the handoff is encrypted until
  the wall takes it once.
- Sign-in tries are rate-limited in the database (one atomic upsert), per address and per IP.
- Requests that change something must come from our own origin (`sameOrigin`).
- Security headers on every response (`src/lib/securityHeaders.ts`): HSTS, nosniff, `frame-ancestors 'none'` (wall
  `/display/` stays unframeable; `/household/preview/` allows `frame-ancestors 'self'` so the Views tab can embed it), a
  CSP that allows only our own origin (and Sentry's ingest, Cloudflare's speed test in `connect-src` for the internet widget, `'self'` plus earth.nullschool.net, embed.windy.com and the video and chart embeds in `frame-src`;
  `script-src` never allows `'unsafe-inline'` — Next.js pages get a per-request nonce from `proxy.ts`, the display loads
  only `/display/display.js`), and a Permissions-Policy that turns off camera, microphone and location.
- **Family sessions** (`FAMILY_EMAILS`) use `/family/` and the meals, shopping and messages APIs only. They are not
  accepted as display viewers (`viewerFor`), so they cannot call `/api/display/*` (Home Assistant, cameras, tasks, …).
- **Display-token family edits:** a valid `x-display-token` may use the meals, shopping and messages APIs the same way
  a family session does (`familyEditorFor`), so `/d/<token>/edit/` works without login. It does not grant admin pin,
  settings, or anything beyond those three APIs through that helper — but the same token still unlocks `/api/display/*`
  if someone crafts requests (as the wall already can).
- **Display image auth:** unlocking `/display/` sets HttpOnly `ep_wall` (`Path=/`) and `ep_display`
  (`Path=/api/display/`) for years (effectively until New link / delete; browsers may clamp Max-Age, and each
  `/display/` load refreshes both); `<img>` uses `ep_display`; the long-lived device token stays in
  `x-display-token` / `data-token` for fetch, never in image query strings.
- **Home Assistant URL:** must be public https; changing it (save or backup restore) clears the stored token and
  Cloudflare Access pair so they are never sent to a new host.
- Error reports are scrubbed of emails, display tokens (including 8-character `/d/` links) and cookies before they leave (`src/lib/sentryScrub.ts`).

## Monitoring (Melvin, 2026-11-17)

- **Sentry**, off unless `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` is set. Server errors through `instrumentation.ts`.
  The admin panel loads the Sentry library only after the first error (as in Gradelings). The display never loads it:
  it posts its errors to our own route, which forwards them to Sentry from the server.

## Testing and CI/CD (Melvin, 2026-11-17: "dont forget testing in cicd")

- `.github/workflows/ci.yml` runs on every pull request and every push to `main`: types, lint, formatting and
  dependency audit; Vitest with coverage; the production build; and the Playwright browser tests against that build
  (`scripts/e2e.mjs`, which signs in with `AUTH_TEST_MODE` and fails on any console error). **"CI passed"** is the
  one check to require. A new push to a pull request cancels its stale run, but runs on `main` are never cancelled:
  each merge commit gets its own full run, because merges land minutes apart and a cancelled run left them unchecked.
  Markdown-only changes still get a green "CI passed" (so branch protection is happy), but types, tests and the build
  are skipped (Melvin, 2026-11-23: document changes shouldn't trigger CI tests).
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
- **Address:** **www.everydaypane.com** (and apex). `NEXT_PUBLIC_SITE_URL` in Vercel must match (baked into
  `metadataBase` / icon hrefs at build — a stale host makes CI e2e fail with `net::ERR_SSL_PROTOCOL_ERROR`). CI and
  `scripts/e2e.mjs` set it to `http://localhost:3100`.
- **Alert email** is sent from `hello@getliftsmith.com` (verified in Resend, click tracking off so links aren't
  rewritten) until everydaypane.com mail is verified. Sign-in codes are sent by Clerk. `ADMIN_EMAILS` seeds Melvin's
  grandfather Household admin and platform staff.
- **Database:** a Turso database from the Vercel Marketplace integration, connected to the project (its `TURSO_*`
  variables are read by `src/server/db.ts`).

## Code conventions

- Prettier formats every code file; run `npm run format` before committing.
- Server-only modules start with `import "server-only"`. The display never imports zod or React.
- Comments explain why, and name who decided and when for product rules.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
