// Public blog: release notes, guides and comparisons. Structured data so the index, sitemap, RSS and pages share one list.

export type PostKind = "release" | "guide" | "compare" | "story";

export type Block =
  { p: string } | { h2: string } | { h3: string } | { ul: string[] } | { ol: string[] } | { tip: string } | { cta?: true };

export interface Post {
  slug: string;
  title: string;
  description: string;
  date: string;
  tag: string;
  kind: PostKind;
  /** Semver when kind is release. */
  version?: string;
  /** App screenshot under public/, e.g. /templates/kitchen-glance.png */
  image: string;
  body: Block[];
}

function release(
  version: string,
  date: string,
  title: string,
  description: string,
  bullets: string[],
  more: Block[] = [],
  image = "/templates/kitchen-glance.png",
): Post {
  return {
    slug: `whats-new-${version.replace(/\./g, "-")}`,
    title,
    description,
    date,
    tag: "Updates",
    kind: "release",
    version,
    image,
    body: [{ p: description }, { h2: "New" }, { ul: bullets }, ...more, { cta: true }],
  };
}

function guide(
  slug: string,
  date: string,
  title: string,
  description: string,
  tag: string,
  body: Block[],
  image = "/templates/morning-brief.png",
): Post {
  return { slug, title, description, date, tag, kind: "guide", image, body: [...body, { cta: true }] };
}

function compare(slug: string, date: string, title: string, description: string, body: Block[], image = "/templates/family-hub.png"): Post {
  return { slug, title, description, date, tag: "Compare", kind: "compare", image, body: [...body, { cta: true }] };
}

function story(slug: string, date: string, title: string, description: string, body: Block[], image = "/templates/photo-frame.png"): Post {
  return { slug, title, description, date, tag: "Family", kind: "story", image, body: [...body, { cta: true }] };
}

const RELEASES: Post[] = [
  release(
    "0.1.0",
    "2026-11-17",
    "What's new in Everydaypane 0.1.0",
    "The first Everydaypane build: clocks, weather, Google Calendar, photos, Home Assistant, alerts and a phone admin.",
    [
      "Digital and analogue clocks for any time zone, with Vancouver and Toronto ready",
      "Weather for the week with icons, plus air quality",
      "Google Calendar today schedule and month grid",
      "Amazon Photos and a private photo library",
      "Home Assistant tiles and UniFi Protect camera snapshots",
      "Family message board and emergency alerts for BC",
      "Drag-and-drop views, day and night themes, offline mode and burn-in protection",
      "Magic-link admin sign-in through Resend",
    ],
    [],
    "/templates/kitchen-glance.png",
  ),
  release(
    "0.1.1",
    "2026-11-17",
    "What's new in Everydaypane 0.1.1",
    "Music on the wall through Home Assistant — Spotify and Sonos controls without leaving the kitchen.",
    [
      "Music widget: now playing, play/pause, skip, volume and sources",
      "Album art proxied at display size",
      "Doorbell pop-up full screen when the ring entity changes",
    ],
    [],
    "/templates/smart-home.png",
  ),
  release(
    "0.1.2",
    "2026-11-17",
    "What's new in Everydaypane 0.1.2",
    "Meal planning from a phone, shown as breakfast, lunch and dinner on the wall.",
    [
      "Meals table with one row per day and meal",
      "Plan from the admin Meals tab or /family/",
      "Widget shows the next meal, or up to a week",
    ],
    [],
    "/templates/week-planner.png",
  ),
  release(
    "0.2.0",
    "2026-11-19",
    "What's new in Everydaypane 0.2.0",
    "TransLink departures, commute times with traffic, BC Hydro outages and settings backup.",
    [
      "TransLink widget with live GTFS-realtime times from up to six stops",
      "Commute widget with TomTom traffic and optional leave-by times",
      "BC Hydro outages on the alert strip and alerts widget",
      "Settings › Backup: download and restore the settings document as JSON",
      "Month calendar title toggle",
    ],
    [],
    "/templates/commute-dash.png",
  ),
  release(
    "0.3.0",
    "2026-11-21",
    "What's new in Everydaypane 0.3.0",
    "Rain radar, chore chart, kitchen timers, pomodoro, BC Ferries, earth wind map, sports scores and a screen saver.",
    [
      "Environment Canada radar over an Esri map, observed and forecast",
      "Chore chart with stars, weekly goals and fair rotation",
      "Timer and pomodoro widgets with full-screen alerts and beeps",
      "BC Ferries capacity from the community API",
      "earth.nullschool.net framed and centred on a place you pick",
      "Sports scores from ESPN for NHL, NBA, WNBA, NFL, MLB, MLS and football leagues",
      "Screen saver: photos or dark after idle, night window, motion wake",
      "Widgets may sit on top of a photos backdrop",
    ],
    [],
    "/templates/rainy-day.png",
  ),
  release(
    "0.4.0",
    "2026-11-22",
    "What's new in Everydaypane 0.4.0",
    "Shopping list, school status, who's home, UV and pollen, live views editor and B.C. permanent daylight time handling.",
    [
      "Shopping list with tap-to-tick on the wall",
      "School status from the district page (Langley SD35 by default)",
      "Who's home from Home Assistant person and device trackers (read only)",
      "Weather UV index and pollen",
      "Live editable layout on the Views tab with right-hand settings drawers",
      "Tile padding, per-widget background opacity",
      "Month calendar weeks, weekends toggle, fit titles and scroll",
      "Fixed UTC−7 for Vancouver after B.C.'s March 2026 permanent daylight time",
      "Locks can lock, never unlock from the wall",
    ],
    [],
    "/templates/kids-routine.png",
  ),
  release(
    "0.5.0",
    "2026-11-23",
    "What's new in Everydaypane 0.5.0",
    "Public homepage, pricing, comparisons, blog, privacy and terms — so families can discover Everydaypane.",
    [
      "Marketing homepage in the spirit of Tuned and Liftsmith",
      "Free vs Household pricing table with Household as best value",
      "Compare pages for DAKboard, MagicMirror, Skylight, Echo Show, Hearth and Cozyla",
      "SEO blog with release notes, guides and deep comparisons",
      "robots.txt, sitemap, RSS feed and production legal pages",
      "Version and build hash in the site footer (plain text, no links)",
    ],
    [],
    "/templates/simple-day.png",
  ),
];

const GUIDES: Post[] = [
  guide(
    "setup-wall-display",
    "2026-11-23",
    "Set up Everydaypane on a wall display",
    "Hang Everydaypane on a kitchen touchscreen, tablet, Chromecast or Fire tablet: Free signup, display link, kiosk tips and the default 12×8 grid.",
    "Setup",
    [
      {
        p: "Everydaypane runs in any modern browser. It is tuned for a landscape kitchen panel around **1920×1080**, and it also works on tablets, smart displays and TVs you already own. Start with a [Free household](/signin/?intent=signup) — two displays, no card.",
      },
      { h2: "1. Create a display address" },
      {
        p: "In the household panel, open **Displays** and add a device. Copy the secret `/d/…` link. New addresses are eight characters; older longer ones still work. You can show and copy the address again any time — it is stored encrypted.",
      },
      { h2: "2. Open the link on the screen" },
      {
        ul: [
          "Use the display's browser, or set the address as the start page in kiosk settings.",
          "**Chromecast / Google TV:** cast a Chrome tab with the display URL open, or use the TV browser and set the address as the start page.",
          "**Fire tablet / Android:** fullscreen browser or a simple kiosk launcher pointed at `/d/…`.",
          "Pinch zoom is locked on purpose so a fixed wall layout stays put.",
          "The page sets a short-lived cookie for images; the long token stays in a header for fetches.",
        ],
      },
      { h2: "3. Match the default grid" },
      {
        p: "Views default to a **12×8** grid with gap 16, edge 14 and tile padding 16 — a good fit for landscape wall panels. One-tap presets and a grouped widget picker speed the first layout. Free includes one view; [Household](/pricing/) unlocks more.",
      },
      { h2: "4. Schedule morning to night" },
      {
        p: "Point the display at the time-of-day schedule so morning, afternoon, evening and night each get their own view, theme and dimming. The screen saver can go dark in a night window and wake on tap, motion, doorbell, alert or timer.",
      },
      {
        tip: "After B.C.'s permanent daylight time, Everydaypane keeps Vancouver clocks on UTC−7 even when the panel's browser has old time-zone data.",
      },
    ],
    "/templates/kitchen-command.png",
  ),
  guide(
    "connect-google-calendar-and-tasks",
    "2026-11-18",
    "Connect Google Calendar and Google Tasks",
    "OAuth setup, which scopes Everydaypane asks for, and how taps on the wall sync tasks back to Google.",
    "Setup",
    [
      {
        p: "One Google account powers the schedule, the month calendar and optional Tasks. Tokens are encrypted on the server and never sent to a browser.",
      },
      { h2: "Calendar" },
      {
        ul: [
          "Connect from Settings with `calendar.readonly`.",
          "Pick calendars and colours in `integrations.google.calendars`.",
          "The server merges about a month of grid plus the next six weeks into one five-minute feed.",
        ],
      },
      { h2: "Tasks" },
      {
        p: "Google Keep has no personal API, so Everydaypane uses **Google Tasks** instead. Connect with the tasks scope, switch lists on in Settings, and show them on a tasks widget. A tap ticks a task off after a four-second undo, only for lists a widget with `allowCheck` shows.",
      },
      { tip: "Family calendar events from /family/ merge into the same feed in Everydaypane blue (#5b8def)." },
    ],
    "/templates/calendar-wall.png",
  ),
  guide(
    "home-assistant-cloudflare-tunnel",
    "2026-11-18",
    "Home Assistant through a free Cloudflare Tunnel",
    "Reach Home Assistant at a public hostname with Cloudflare Access service tokens — no Nabu Casa required.",
    "Setup",
    [
      {
        p: "Displays never talk to Home Assistant directly. The Everydaypane server calls HA's REST API through a **Cloudflare Tunnel** locked with Access service auth.",
      },
      { h2: "Why this shape" },
      {
        p: "Nabu Casa works, but Melvin chose the free Cloudflared add-on so the kitchen dashboard is not another monthly bill. The tunnel hostname (for example `ha.getliftsmith.com`) only accepts requests with our Access client id and secret.",
      },
      { h2: "What the wall can do" },
      {
        ul: [
          "Toggle, light, sensor, climate, cover, lock (lock only), button",
          "UniFi Protect snapshots on a timer",
          "Doorbell full-screen pop-up",
          "Who's home — read only",
          "Music through HA media players",
        ],
      },
      { tip: "Changing the Home Assistant URL clears stored tokens so credentials never follow a new host." },
    ],
    "/templates/smart-home.png",
  ),
  guide(
    "translink-departures-on-the-wall",
    "2026-11-19",
    "TransLink departures on the kitchen wall",
    "Pick up to six stops, filter routes, and show live times from GTFS-realtime without a heavy protobuf library.",
    "Transit",
    [
      {
        p: "The TransLink widget reads trip updates from `gtfsapi.translink.ca`, decoded by a small hand-written protobuf reader. Static route names come from range requests into the GTFS zip — never the huge `stop_times.txt`.",
      },
      { h2: "Setup" },
      {
        ol: [
          "Add a `TRANSLINK_API_KEY` in Vercel.",
          "In the widget, search stops and keep up to six.",
          "Optionally filter routes and set a walk-minutes cutoff.",
        ],
      },
      {
        p: "One 30-second server read is shared by every display. Between polls the wall counts minutes down from absolute times. Live times from TransLink are credited on the widget.",
      },
    ],
    "/templates/commute-dash.png",
  ),
  guide(
    "commute-times-with-tomtom",
    "2026-11-19",
    "Commute times with live traffic",
    "Why TomTom, how places are geocoded once, and how leave-by times work on the wall.",
    "Transit",
    [
      {
        p: "The commute widget calls TomTom Routing with `traffic=true` for up to six places from home. TomTom's free tier (2,500 requests a day, no card) beat Google's Routes API for this kitchen use case.",
      },
      {
        ul: [
          "Geocode home and each place once in Settings › Commute",
          "Each drive is cached five minutes and shared across displays",
          "Optional be-there-by time → leave-by on the widget",
          "Readings older than 20 minutes are not shown as live",
        ],
      },
    ],
    "/templates/commute-dash.png",
  ),
  guide(
    "rain-radar-environment-canada",
    "2026-11-21",
    "Rain radar from Environment Canada",
    "MSC GeoMet 1 km radar, forecast extrapolation and an Esri grey canvas basemap — no RainViewer key required.",
    "Weather",
    [
      {
        p: "RainViewer's free API closed in early 2026. Everydaypane uses Environment Canada's **RADAR_1KM_RRAI** / snow layers plus GeoMet extrapolation, composited over Esri's grey canvas (CARTO started watermarking without a key).",
      },
      {
        p: "Displays get times and tile indexes only; frames and tiles are proxied. The widget loops at most 10 observed and 6 forecast frames, resting on the latest and the last.",
      },
    ],
    "/templates/rainy-day.png",
  ),
  guide(
    "chore-chart-for-kids",
    "2026-11-21",
    "A chore chart kids will actually use",
    "Recurring chores, fair rotation, stars and weekly goals — separate from Google Tasks on purpose.",
    "Family",
    [
      {
        p: "Chores live in settings; ticks live in `chores_done` with the stars they were worth that day. Assignees are computed, never stored: turns count from a fixed Monday so Monday/Wednesday/Friday chores alternate cleanly.",
      },
      {
        ul: [
          "Tap to tick on the wall when `allowCheck` is on",
          "Second tap takes it back (no long undo delay)",
          "Weekly star totals toward an optional goal",
        ],
      },
    ],
    "/templates/kids-routine.png",
  ),
  guide(
    "shopping-list-and-meals",
    "2026-11-22",
    "Shopping list and meal planning from phones",
    "How /family/ and the admin Meals and Shopping tabs keep the wall fed without a settings Save.",
    "Family",
    [
      {
        p: "Meals and shopping are not part of the settings document — they save when a box loses focus or an item is added, so kids and partners on `FAMILY_EMAILS` can help from a phone.",
      },
      {
        ul: [
          "Add from this week's meals copies distinct dinners that are not already open",
          "Bought items drop off after seven days",
          "Wall taps respect `allowCheck` because anyone in the kitchen can reach the screen",
        ],
      },
    ],
    "/templates/week-planner.png",
  ),
  guide(
    "emergency-alerts-for-bc",
    "2026-11-17",
    "Emergency alerts for Langley and BC",
    "Alert Ready, Environment Canada, DriveBC, Earthquakes Canada and BC Hydro on one dismissible red strip.",
    "Safety",
    [
      {
        p: "Alerts are for Langley, the Lower Mainland, BC and Canada. Each source is cached on its own; one failure never hides the others. The strip pushes widgets down rather than covering them.",
      },
      {
        ul: [
          "NAAD / Alert Ready (including Environment Canada weather warnings)",
          "DriveBC major events and weather conditions",
          "Earthquakes Canada (last 24 hours, distance filtered here)",
          "BC Hydro outages: covering home is severe; nearby uses customer counts",
        ],
      },
      { tip: "Optional email to ADMIN_EMAILS and FAMILY_EMAILS when a new strip-worthy alert arrives." },
    ],
    "/templates/morning-brief.png",
  ),
  guide(
    "photos-amazon-google-library",
    "2026-11-17",
    "Family photos without a public album URL",
    "Amazon shared albums and people search, Google Photos Picker copies into a private Vercel Blob library, and proxied images at cell size.",
    "Photos",
    [
      {
        p: "Amazon has no official personal API. Shared albums use the share page's own endpoints; people search needs the admin's pasted cookies (encrypted). When Amazon returns a robot 503, Everydaypane waits, retries once, then serves the last good list — we never disguise the server.",
      },
      {
        p: "The photo library stores uploads and Google Photos picks in a private Blob store. Displays only receive ids the server listed; `/api/display/photo/` fetches at the width the cell draws.",
      },
    ],
    "/templates/photo-frame.png",
  ),
  guide(
    "screen-saver-and-burn-in",
    "2026-11-21",
    "Screen saver, dimming and burn-in protection",
    "Idle photos or dark, night window, motion wake, pixel shift — and why a browser cannot switch a panel's backlight off.",
    "Display",
    [
      {
        p: "The saver sits above the dashboard and below the doorbell and alert strip, so emergencies stay visible. Underneath, the dashboard stays mounted but `visibility: hidden` so wake is instant. Dark mode is a black screen: a browser cannot turn the panel backlight off.",
      },
      {
        ul: [
          "Pixel shift against burn-in",
          "Photo mode reuses the photos widget; the clock wanders a few pixels each minute",
          "Home Assistant motion sensors keep the screen awake and can wake it",
        ],
      },
    ],
    "/templates/night-clock.png",
  ),
  guide(
    "bc-ferries-on-everydaypane",
    "2026-11-21",
    "BC Ferries sailings on Everydaypane",
    "Next sailings, percent full, cancellations and delays from the community BC Ferries API.",
    "Transit",
    [
      {
        p: "BC Ferries has no public API. Everydaypane reads `bcferriesapi.ca` (MIT, no key), caches two minutes, and serves the last good copy when the upstream is down.",
      },
      {
        p: "Pick up to four routes in the widget. Sailings drop five minutes after departure on the wall clock; conditions older than 15 minutes show their age.",
      },
    ],
    "/templates/ferry-weekend.png",
  ),
  guide(
    "sports-scores-espn",
    "2026-11-21",
    "Live sports scores without team logos",
    "Follow NHL, NBA, WNBA, NFL, MLB, MLS and football clubs via ESPN's public site API — colour dots keep the display light.",
    "Sports",
    [
      {
        p: "Settings › Sports lists a league's teams (cached a day). Schedules refresh every 30 minutes; live scoreboards poll every 30 seconds only while a game might be on. No logos — each row uses the team's colour.",
      },
    ],
    "/templates/sports-lounge.png",
  ),
  guide(
    "kitchen-timers-and-pomodoro",
    "2026-11-21",
    "Kitchen timers and a separate pomodoro",
    "Local-only timers with full-screen alerts and Web Audio beeps; pomodoro chimes between focus and break.",
    "Timers",
    [
      {
        p: "Timers and pomodoro run entirely on the display in localStorage. Alarms belong to the screen, so they still ring after a settings save or when the schedule switches views. Sound needs a prior tap — starting a timer counts.",
      },
    ],
    "/templates/focus-desk.png",
  ),
  guide(
    "offline-mode-service-worker",
    "2026-11-17",
    "Offline mode on the wall",
    "How the service worker serves the last good data and shows Offline without turning the kitchen blank.",
    "Display",
    [
      {
        p: "The display is server-rendered HTML plus one small script. When the network drops, the service worker keeps the last good JSON and marks the UI offline. Radar frames are left alone so forecast URLs do not fill the cache.",
      },
    ],
    "/templates/dual-city.png",
  ),
];

const COMPARES: Post[] = [
  compare(
    "everydaypane-vs-dakboard",
    "2026-11-23",
    "Everydaypane vs DAKboard",
    "DAKboard is a flexible cloud dashboard; Everydaypane is a kitchen wall with transit, garbage, ferries and alerts built in.",
    [
      {
        p: "Both products put calendars, photos and weather on a wall. DAKboard wins on sheer block variety and optional hardware. Everydaypane wins when you want **Langley garbage, TransLink, BC Ferries, Environment Canada radar and Alert Ready** without assembling third-party feeds.",
      },
      { h2: "Hardware" },
      {
        p: 'DAKboard sells 22" and 27" touch displays (hundreds of dollars) or runs on a browser / Pi. Everydaypane is software-first: bring a tablet, TV or wall panel you already own.',
      },
      { h2: "Price" },
      {
        p: "DAKboard's Plus plan is about $8/month billed yearly. Everydaypane Household is $59/year with up to 20 displays and every widget — and a capable Free tier (two displays, one view).",
      },
      { h2: "Admin" },
      {
        p: "Everydaypane's Views tab embeds a live editable layout with right-hand drawers; draft changes patch widgets in place. Displays still poll every 30 seconds for saved settings only.",
      },
      {
        p: "See the full matrix on the [DAKboard comparison page](/compare/dakboard/).",
      },
    ],
    "/templates/kitchen-glance.png",
  ),
  compare(
    "everydaypane-vs-magicmirror",
    "2026-11-23",
    "Everydaypane vs MagicMirror²",
    "MagicMirror is a brilliant DIY raspberry-pi project. Everydaypane is a hosted family product with a phone admin and touch widgets.",
    [
      {
        p: "MagicMirror² is free, open source and endlessly hackable. It also means SD cards, `config.js`, community modules and a mirror that does not love fingerprints.",
      },
      {
        p: "Everydaypane trades that freedom for a **drag-and-drop grid**, encrypted secrets, magic-link family accounts and widgets that are tested together. You will not SSH into the kitchen at dinner.",
      },
      { p: "Full side-by-side: [compare MagicMirror](/compare/magicmirror/)." },
    ],
    "/templates/dual-city.png",
  ),
  compare(
    "everydaypane-vs-skylight",
    "2026-11-23",
    "Everydaypane vs Skylight Calendar",
    "Skylight is a polished appliance. Everydaypane is bring-your-own-screen software with smart home and BC transit Skylight does not offer.",
    [
      {
        p: "Skylight Calendar 2 (~$300) is the easiest sealed product in the category. Plus at ~$79/year unlocks meals, photo screensaver and Magic Import — features Everydaypane includes on Household without buying a proprietary panel.",
      },
      {
        p: "If nobody in the house wants to configure a dashboard, Skylight is a fair pick. If you already have a display, run Home Assistant, or care about TransLink and ferries, Everydaypane fits better.",
      },
      { p: "Details: [compare Skylight](/compare/skylight/)." },
    ],
    "/templates/calendar-wall.png",
  ),
  compare(
    "everydaypane-vs-echo-show",
    "2026-11-23",
    "Everydaypane vs Amazon Echo Show",
    "Echo Show is an Alexa smart display. Everydaypane is a dedicated family dashboard that does not rotate promotional home screens.",
    [
      {
        p: "Echo Show 15 and 21 are excellent when video calls, Fire TV and Alexa routines are the point. They are weaker as a durable shared calendar and chore board.",
      },
      {
        p: "Everydaypane keeps one composition you design — clocks, calendars, chores, meals, transit — and never shows ads. Locks on the wall can lock but never unlock.",
      },
      { p: "More: [compare Echo Show](/compare/echo-show/)." },
    ],
    "/templates/simple-day.png",
  ),
  compare(
    "everydaypane-vs-hearth",
    "2026-11-23",
    "Everydaypane vs Hearth Display",
    "Hearth focuses on portrait routines for kids. Everydaypane covers the wider kitchen: transit, smart home, sports and BC alerts.",
    [
      {
        p: "Hearth's ~$699 portrait panel and membership model target child independence. Everydaypane's chore chart covers stars and rotation on a screen you already own, then adds the rest of family life Hearth leaves out.",
      },
      { p: "Matrix: [compare Hearth](/compare/hearth/)." },
    ],
    "/templates/kids-routine.png",
  ),
  compare(
    "everydaypane-vs-cozyla",
    "2026-11-23",
    "Everydaypane vs Cozyla Calendar",
    "Cozyla ships large Android calendar tablets. Everydaypane keeps software independent from the panel so you are not locked into one OEM.",
    [
      {
        p: 'Cozyla\'s 24" and 32" panels are impressive hardware. Everydaypane prefers a browser on whatever panel you choose, with Home Assistant and UniFi Protect first-class.',
      },
      { p: "Matrix: [compare Cozyla](/compare/cozyla/)." },
    ],
    "/templates/family-hub.png",
  ),
  compare(
    "everydaypane-vs-homescreens",
    "2026-11-23",
    "Everydaypane vs Home Screens",
    "Home Screens is a self-hosted Pi family dashboard with freeform layouts. Everydaypane is cloud SaaS with the same chore and clock energy plus BC kitchen integrations.",
    [
      {
        p: "Home Screens shines if you want a free forever LAN hub, a freeform canvas and a dedicated kids chores page on a Raspberry Pi. Everydaypane keeps the family UX (chore bands, flip clocks, portrait templates) while hosting the admin and feeds for you — with TransLink, Langley garbage, BC Ferries and Alert Ready built in.",
      },
      { h2: "Hosting" },
      {
        p: "Home Screens runs on your Pi and network. Everydaypane runs on Vercel with a Turso database; displays are just a browser URL.",
      },
      { h2: "Layout" },
      {
        p: "Home Screens defaults to a portrait freeform canvas. Everydaypane uses a CSS grid (12×8 landscape or 8×12 portrait) with live phone editing and starter templates.",
      },
      { p: "Full matrix: [compare Home Screens](/compare/homescreens/)." },
    ],
    "/templates/family-hub-portrait.png",
  ),
  compare(
    "best-family-dashboard-2026",
    "2026-11-23",
    "Best family wall dashboard in 2026",
    "How to choose between Everydaypane, DAKboard, Home Screens, Skylight, MagicMirror, Echo Show, Hearth and Cozyla for a kitchen wall.",
    [
      { h2: "Start with the job" },
      {
        ul: [
          "**Appliance, zero config:** Skylight Calendar 2.",
          "**DIY mirror project:** MagicMirror².",
          "**Self-hosted Pi family hub:** Home Screens.",
          "**Alexa already runs the kitchen:** Echo Show.",
          "**Maximum third-party blocks:** DAKboard.",
          "**Smart home + BC transit + bring your own screen:** Everydaypane.",
        ],
      },
      { h2: "Three-year cost thinking" },
      {
        p: "A $300–$800 panel plus $70–$90/year adds up. Everydaypane Household at $59/year on a display you own is usually the lowest cost for the widest kitchen feature set — especially if Home Assistant is already humming.",
      },
      { p: "Browse every matrix on the [compare index](/compare/)." },
    ],
    "/templates/kitchen-command.png",
  ),
];

const MORE_GUIDES: Post[] = [
  guide(
    "kitchen-wall-dashboard-free",
    "2026-11-23",
    "A free kitchen wall dashboard (without buying a panel)",
    "What Free includes on Everydaypane: two displays, calendars, weather and photos — and when Household is worth it.",
    "Guides",
    [
      {
        p: "Looking for a **family wall dashboard** or **kitchen display** without a $300–$800 appliance? Everydaypane is software: open a browser on a tablet, TV or wall panel you already own.",
      },
      { h2: "What Free includes" },
      {
        ul: [
          "Two wall displays and one view",
          "Clock, date, weather, sunrise & sunset, air quality",
          "Photos, notes, WiFi QR and countdowns",
          "Up to two Google calendars, plus schedule and month widgets",
          "Day and night themes, offline mode and burn-in protection",
          "No ads, no tracking cookies",
        ],
      },
      {
        p: "[Start free](/signin/?intent=signup) with an email — we send a magic link and create your household. Then open **Displays**, add a screen and copy the `/d/…` address onto the wall.",
      },
      { h2: "When to upgrade to Household" },
      {
        p: "Household ($7/mo or $59/yr) unlocks chores, meals, shopping, TransLink, commute, BC Ferries, Home Assistant, timers, more views and displays, and the rest of the widget catalogue. Compare Free vs Household on [pricing](/pricing/), or see [Everydaypane vs DAKboard](/compare/dakboard/).",
      },
      {
        tip: "Langley and Lower Mainland families get garbage day, school status, Alert Ready and Environment Canada radar on Household — see the [features](/features/) list.",
      },
    ],
    "/templates/kitchen-glance.png",
  ),
  guide(
    "ical-calendar-links",
    "2026-11-17",
    "Add school and sports calendars with iCal links",
    "Secret calendar addresses stay encrypted; failures never hide Google's events.",
    "Setup",
    [
      {
        p: "Settings › Calendar links accepts any https iCal address — school, TeamSnap exports, someone else's Google secret address. The URL is stored as an encrypted secret because it often works as a password; the settings document keeps only name, colour and on/off.",
      },
      {
        p: "The server reads each link with ical.js (recurrence, exceptions, floating times in the dashboard zone), caches 15 minutes, and merges into the same feed as Google. Only public https addresses are fetched, including after redirects.",
      },
    ],
    "/templates/calendar-wall.png",
  ),
  guide(
    "month-calendar-weeks-and-weekends",
    "2026-11-21",
    "Show 1 to 6 weeks and hide weekends",
    "Rolling week views, Sunday or Monday start, fit titles and scroll after N week rows.",
    "Calendar",
    [
      {
        p: "The month widget can show the whole month or 1–6 weeks from this one. Turn off weekends to drop Saturday and Sunday columns. Fit titles wrap and shrink instead of ellipsis; busy days still use “+N more”. When week rows exceed `scrollWeeks` (default 3), the tile scrolls by touch.",
      },
    ],
    "/templates/week-planner.png",
  ),
  guide(
    "widgets-on-top-of-photos",
    "2026-11-21",
    "Layer widgets on top of the photos backdrop",
    "Photos sit behind everything else; on-photo panels stay at least 55% opaque and clocks turn white with a soft shadow.",
    "Display",
    [
      {
        p: "A photos widget is a backdrop layer. Any other widget may cover it; two photos widgets still never overlap. New widgets fill empty cells first and only land on photos when nothing else is free.",
      },
    ],
    "/templates/photo-frame.png",
  ),
  guide(
    "per-widget-backgrounds",
    "2026-11-22",
    "Turn each tile's background on or off",
    "Clocks and dates start without a panel; opacity falls back to the theme when unset.",
    "Display",
    [
      {
        p: "Every widget has Background on/off and Background opacity. Theme surface opacity is the default. An older sunrise “transparent” setting becomes Background off.",
      },
    ],
    "/templates/night-clock.png",
  ),
  guide(
    "live-views-editor",
    "2026-11-22",
    "Edit the real layout live from your phone",
    "The Views tab embeds the display under a drag overlay and patches draft widgets in place over postMessage.",
    "Admin",
    [
      {
        p: "Tap a widget for a right slide-out of its settings; Edit view opens the same drawer for grid, gap, edge, tile and theme. Wall screens still only reload the saved document every 30 seconds — drafts never push to the kitchen until Save.",
      },
    ],
    "/templates/kitchen-command.png",
  ),
  guide(
    "bc-permanent-daylight-time",
    "2026-11-22",
    "B.C. permanent daylight time and old browser zones",
    "Why Everydaypane uses historical Vancouver rules before March 2026 and fixed UTC−7 after.",
    "Display",
    [
      {
        p: "Some display browsers still move `America/Vancouver` back an hour in November. Everydaypane keeps clocks, dates, calendars and time-of-day schedules correct with historical rules before the March 8, 2026 transition and fixed UTC−7 afterward.",
      },
    ],
    "/templates/dual-city.png",
  ),
  guide(
    "school-status-langley-sd35",
    "2026-11-22",
    "School open, closed or delayed on the wall",
    "How Everydaypane reads the district status page (Langley SD35 by default) without following private addresses.",
    "Family",
    [
      {
        p: "Settings › School status holds an https status URL. The server looks for closed, delayed or late start in the page banner, then the rest of the page. A widget can name schools; a notice counts when it names one of them or says all schools.",
      },
    ],
    "/templates/morning-brief.png",
  ),
  guide(
    "spotify-and-sonos-without-ha",
    "2026-11-18",
    "Spotify and Sonos beside Home Assistant",
    "Music widgets can use HA, Spotify Premium or a Sonos speaker — one feed shape on the wall.",
    "Music",
    [
      {
        p: "Connect accounts from Settings › Music. Spotify sources are Connect devices; Sonos sources are favourites for the grouped speaker. Art only comes from addresses the feed already read.",
      },
    ],
    "/templates/smart-home.png",
  ),
  guide(
    "garbage-day-langley",
    "2026-11-17",
    "Township of Langley garbage on the wall",
    "Recycle Coach project 521, district LANGL — look up your zone from the address or pick Monday A / Thursday B by hand.",
    "Family",
    [
      {
        p: "The schedule is cached twelve hours. The widget shows the next pickups for one to eight weeks so packing night is obvious from the island.",
      },
    ],
    "/templates/simple-day.png",
  ),
  guide(
    "settings-backup-and-restore",
    "2026-11-21",
    "Back up and restore your settings",
    "Download the settings document as JSON; secrets, meals and photos stay out unless you opt WiFi passwords in.",
    "Admin",
    [
      {
        p: "Settings › Backup runs a dry run first so you can see what the file holds. Restore is an ordinary versioned save — stale versions get 409, and displays reload when it lands.",
      },
    ],
    "/templates/focus-desk.png",
  ),
];

const STORIES: Post[] = [
  story(
    "why-a-kitchen-wall-dashboard",
    "2026-11-17",
    "Why put a dashboard on the kitchen wall?",
    "Phones fragment the family calendar. A shared pane by the kettle answers the questions everyone asks out loud.",
    [
      {
        p: "Every household invents the same ritual: shouting from the hallway about swim practice, garbage night and whether the Canucks play. Phones hide that information behind lock screens and different accounts.",
      },
      {
        p: "A wall dashboard is not another notification stream. It is a **calm, always-on composition** — clocks, weather, the next three events, who's home — readable from the island.",
      },
      {
        p: "Everydaypane leans into that: a lightweight display page, phone admin, and widgets for the life we actually live in Langley.",
      },
    ],
    "/templates/family-hub.png",
  ),
  story(
    "canadian-english-on-purpose",
    "2026-11-22",
    "Canadian English on purpose",
    "Colour, centre, favourite — Everydaypane is written the way Canadian readers expect.",
    [
      {
        p: "Product copy uses Canadian English throughout, as in Liftsmith. It is a small signal that the dashboard was made here — next to Township of Langley garbage codes and TransLink stop numbers.",
      },
    ],
    "/templates/morning-brief.png",
  ),
  story(
    "lightweight-display-budget",
    "2026-11-17",
    "Why the display stays under 40 KB",
    "The wall is not a React app. Server-rendered HTML plus one esbuild bundle keeps low-power screens snappy.",
    [
      {
        p: "Melvin's rule: emphasize a super lightweight front end so the dashboard loads quickly. The admin may be complex; the `/d/` page may not.",
      },
      {
        ul: [
          "Script under 40 KB gzipped, stylesheet under 20 KB (CI checks)",
          "Widgets update only the DOM nodes that change",
          "Heavy API work stays on the server with shared caches",
        ],
      },
    ],
    "/templates/kitchen-glance.png",
  ),
  story(
    "privacy-without-tracking",
    "2026-11-17",
    "Privacy without tracking cookies",
    "No ads, no analytics cookies, scrubbed error reports and encrypted secrets.",
    [
      {
        p: "Anyone can create a Free household with a magic-link email. Secrets (Google, Amazon, Home Assistant, iCal URLs) are AES-GCM encrypted. Sentry is optional and scrubbed of emails and display tokens. We do not run third-party product analytics — the marketing site uses a cookieless first-party counter; organic traffic also stays in Search Console; paid conversions in Stripe.",
      },
      { p: "Read the full [privacy policy](/privacy/)." },
    ],
    "/templates/photo-frame.png",
  ),
  story(
    "family-emails-vs-admin",
    "2026-11-22",
    "Family emails vs admin",
    "Partners and kids on FAMILY_EMAILS can plan meals and shopping without getting Home Assistant controls.",
    [
      {
        p: "`ADMIN_EMAILS` get the full panel. `FAMILY_EMAILS` get `/family/` plus meals, shopping and messages — never `/api/display/*`. The wall remains a display token world.",
      },
    ],
    "/templates/kids-routine.png",
  ),
];

export const POSTS: Post[] = [...RELEASES, ...GUIDES, ...MORE_GUIDES, ...COMPARES, ...STORIES].sort((a, b) =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug),
);

export function postBySlug(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}

export function latestPosts(n: number): Post[] {
  return POSTS.slice(0, n);
}

export function readMinutes(post: Post): number {
  const words = post.body.reduce((n, b) => {
    if ("p" in b) return n + b.p.split(/\s+/).length;
    if ("ul" in b) return n + b.ul.join(" ").split(/\s+/).length;
    if ("ol" in b) return n + b.ol.join(" ").split(/\s+/).length;
    if ("tip" in b) return n + b.tip.split(/\s+/).length;
    if ("h2" in b) return n + b.h2.split(/\s+/).length;
    if ("h3" in b) return n + b.h3.split(/\s+/).length;
    return n;
  }, 0);
  return Math.max(1, Math.round(words / 200));
}
