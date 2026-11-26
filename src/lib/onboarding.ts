import { zonedFormatter } from "./timeZone";

// The getting-started emails (Melvin, 2026-11-26: "daily emails for as many days as possible without repeating and
// without having boring or thin content … after a user registers … each email gives them information about an
// important/useful/fun feature … branded … concise but engaging … a graphic or screenshot of the app … a good portion
// of them should be paid features … so we can appropriately articulate why they should pay"). Built the way
// Liftsmith's tour works (src/server/tour.ts there): one email a day, one feature each, a kicker ("Getting started ·
// 3 of 18"), a title, a short opening, a few points, a button to that screen and a real picture of the app.
//
// The series runs as long as there is something worth saying: 18 emails, seven about what every household gets and
// eleven about Household, each Household one marked as such. Free has 13 widgets, so more Free emails would have been
// thin; the first week leans Free so a new family gets the wall working before being sold anything. Features that are
// switched off platform-wide (feature flags) are skipped when the email comes up, and a point that needs a switched-off
// widget or provider is dropped from its email.
//
// Pure: the household panel, the server, the image script and the tests all import it.

export type OnboardingTier = "free" | "household";

export interface OnboardingPoint {
  text: string;
  /** Feature flag the point needs (widget.<type>, smartHome.<provider>, …). Dropped when it's off. */
  flag?: string;
}

export interface OnboardingStep {
  id: string;
  tier: OnboardingTier;
  /** Every one of these must be on for the email to go out at all. */
  flags: string[];
  subject: string;
  preheader: string;
  title: string;
  intro: string;
  points: OnboardingPoint[];
  /** One last line, a tip or a nudge. */
  tip?: string;
  cta: { label: string; path: string };
  /** `public/email/onboarding/<image>.jpg`, made by `scripts/email-images.mjs`. */
  image: { file: string; alt: string };
}

export const ONBOARDING: readonly OnboardingStep[] = [
  {
    id: "wall",
    tier: "free",
    flags: [],
    subject: "Put Everydaypane on the wall",
    preheader: "Any screen with a browser becomes your family's dashboard in about a minute.",
    title: "Let's get it on the wall",
    intro:
      "Everydaypane runs on any screen with a web browser: a wall tablet, an old laptop, a kitchen TV. Here's the quickest way to get yours up.",
    points: [
      { text: "On the wall screen, open everydaypane.com/display. A QR code appears." },
      { text: "Scan it with your phone, pick the display and tap Approve. No typing passwords on a touchscreen." },
      { text: "It stays unlocked until you remove it, and comes back by itself after a power cut." },
      { text: "Free includes two displays, so the hallway can have one too." },
    ],
    tip: "No touchscreen? Cast a Chrome tab to a Chromecast TV, or set /display as a kiosk browser's start page.",
    cta: { label: "Set up a display", path: "/household/#displays" },
    image: { file: "wall", alt: "A kitchen wall dashboard with the clock, weather, calendar, meals and chores" },
  },
  {
    id: "calendars",
    tier: "free",
    flags: ["widget.agenda"],
    subject: "Your family's week, on one wall",
    preheader: "Bring in Google or Microsoft 365 calendars and see who's where at a glance.",
    title: "Everyone's week, in one place",
    intro: "Connect the calendars your family already uses and the wall keeps itself up to date. No more “wait, is that today?”",
    points: [
      { text: "Google Calendar and Microsoft 365, each calendar in its own colour." },
      { text: "Today's schedule, a week grid, a month, or just “up next” in big letters across the room.", flag: "widget.calendarMonth" },
      { text: "Pick Sunday or Monday weeks, hide weekends, show one to six weeks at a time." },
      { text: "Changes on your phone reach the wall within a few minutes." },
    ],
    tip: "Household adds iCal links (school, sports teams, a shared Outlook calendar) and up to 50 calendars.",
    cta: { label: "Connect a calendar", path: "/household/#settings/google" },
    image: { file: "calendars", alt: "A week of family events in the schedule and month calendar widgets" },
  },
  {
    id: "photos",
    tier: "free",
    flags: ["widget.photos"],
    subject: "Make the wall feel like home",
    preheader: "Your photos as the backdrop, with the clock and weather floating on top.",
    title: "Your photos, front and centre",
    intro: "A dashboard is more fun to walk past when it's full of your own people. Add a photos widget and let it run.",
    points: [
      { text: "Pick favourites from Google Photos, or upload straight from your computer.", flag: "photos.library" },
      { text: "Shared albums from Amazon Photos and iCloud work too.", flag: "photos.amazonShare" },
      { text: "Photos can be the backdrop: other widgets sit on top with a soft panel so they stay readable." },
      { text: "Fill the tile or show the whole picture, with captions if you like." },
    ],
    cta: { label: "Add photos", path: "/household/#settings/photos" },
    image: { file: "photos", alt: "A full-screen photo with the time and date laid over it" },
  },
  {
    id: "schedule",
    tier: "household",
    flags: [],
    subject: "A different wall for mornings and evenings",
    preheader: "The dashboard changes with your day: lunches at breakfast, a calm clock at bedtime.",
    title: "A wall that changes with your day",
    intro:
      "Mornings need the bus and the lunch plan. Evenings need dinner and tomorrow. With a time-of-day schedule, the wall shows the right thing on its own.",
    points: [
      { text: "Morning, afternoon, evening and overnight, each with its own view." },
      { text: "Start a period at a set time, at sunrise or at sunset." },
      { text: "Night mode and dimming kick in by themselves, so it never glares at 2 AM." },
      { text: "Up to 30 views, and a display can loop through a few of them." },
    ],
    cta: { label: "Set up the schedule", path: "/household/#schedule" },
    image: { file: "schedule", alt: "A bright morning view next to a dark overnight clock view" },
  },
  {
    id: "layouts",
    tier: "free",
    flags: [],
    subject: "Make it yours in five minutes",
    preheader: "Start from a ready-made layout, then drag, resize and recolour while you watch.",
    title: "Make it yours in five minutes",
    intro: "You don't have to start from a blank grid. Pick a starter layout, then change anything while the live preview updates.",
    points: [
      { text: "Starter templates for kitchens, kids' rooms, night stands and more." },
      { text: "Drag widgets around and resize from any corner. Nothing ever overlaps." },
      { text: "Colour schemes with a day and a night palette, fonts and rounded corners." },
      { text: "Make any widget's text bigger for across the room, or turn its background off." },
    ],
    tip: "Changes stay in your phone until you tap Publish to wall, so you can play without anyone noticing.",
    cta: { label: "Open the layout editor", path: "/household/#views" },
    image: { file: "layouts", alt: "Six starter layouts for different rooms" },
  },
  {
    id: "meals",
    tier: "household",
    flags: ["widget.meals"],
    subject: "Dinner's sorted. So is the grocery list.",
    preheader: "Plan meals and keep the shopping list from any phone, and see both on the wall.",
    title: "Dinner's sorted. So is the list.",
    intro: "“What's for dinner?” gets answered by the wall. Plan the week from your phone and the whole family can see it.",
    points: [
      { text: "Breakfast, lunch and dinner for each day, planned from any phone." },
      { text: "Repeats like Taco Tuesday or cereal every weekday fill themselves in." },
      { text: "A shared shopping list: add from the phone, tick off with a tap on the wall.", flag: "widget.shopping" },
      { text: "One tap adds the week's meals to the list." },
    ],
    tip: "Scan the wall's phone-edit QR and anyone at home can add milk to the list, no sign-in needed.",
    cta: { label: "Plan this week", path: "/household/#meals" },
    image: { file: "meals", alt: "The meals widget showing today's plan beside the shopping list" },
  },
  {
    id: "weather",
    tier: "free",
    flags: ["widget.weather"],
    subject: "Do they need a jacket?",
    preheader: "Today's weather big enough to read from the doorway, plus the week ahead.",
    title: "Know before you head out",
    intro: "The weather widget answers the morning question from across the room: jacket, umbrella or neither.",
    points: [
      { text: "Right now in big type, then the next hours and up to seven days." },
      { text: "UV index and pollen when they matter." },
      { text: "Air quality (AQHI or US AQI) and today's sunrise and sunset as their own widgets.", flag: "widget.airQuality" },
      { text: "Choose Open-Meteo or Environment Canada as the forecast." },
    ],
    tip: "Household adds an animated rain radar and a wildfire map around your home.",
    cta: { label: "Add the weather", path: "/household/#views" },
    image: { file: "weather", alt: "The weather widget with today's conditions and the week ahead, beside air quality" },
  },
  {
    id: "chores",
    tier: "household",
    flags: ["widget.chores"],
    subject: "Chores the kids actually want to tick off",
    preheader: "A chore chart with stars, rewards and a tap to finish. No nagging required.",
    title: "Chores, minus the nagging",
    intro: "Put the chore chart where everyone walks past it. Kids tap to tick off, earn stars, and can see exactly what's left.",
    points: [
      { text: "Morning, afternoon or evening chores on the days you choose." },
      { text: "Share a chore, or rotate it between kids every time or every week." },
      { text: "Stars for each job, a weekly goal and rewards they can spend them on." },
      { text: "Kids can tick off from their own phone, with an optional PIN." },
    ],
    cta: { label: "Set up chores", path: "/household/#settings/chores" },
    image: { file: "chores", alt: "A chore chart with three kids, ticked-off chores and stars earned" },
  },
  {
    id: "guests",
    tier: "free",
    flags: [],
    subject: "The little things guests notice",
    preheader: "A WiFi QR code, countdowns to the good stuff and clocks for family far away.",
    title: "The little things guests notice",
    intro: "Small widgets, big “oh, that's handy” energy. These are all on Free.",
    points: [
      { text: "A WiFi QR code: guests point their camera and they're on. No spelling the password.", flag: "widget.wifiQr" },
      { text: "Countdowns to birthdays, holidays and trips. Yearly ones roll over by themselves.", flag: "widget.countdown" },
      { text: "Clocks for other cities, in seven styles from flip to neon.", flag: "widget.clock" },
      { text: "A note for anything else: the door code, the dog's feeding time.", flag: "widget.note" },
    ],
    cta: { label: "Add a widget", path: "/household/#views" },
    image: { file: "guests", alt: "Countdowns to Christmas and New Year's beside a clock" },
  },
  {
    id: "alerts",
    tier: "household",
    flags: ["widget.alerts"],
    subject: "The alerts that matter, where you'll see them",
    preheader: "Weather warnings, power outages and evacuation orders across the top of the wall.",
    title: "Alerts where you'll actually see them",
    intro: "When something serious is happening nearby, it shows up as a red strip across the top of every screen in the house.",
    points: [
      { text: "Alert Ready and Environment Canada weather warnings." },
      { text: "BC Hydro outages and evacuation orders near your home." },
      { text: "DriveBC road events and earthquakes in the region." },
      { text: "Optionally emailed to everyone in the household, so nobody misses one." },
    ],
    tip: "Tap the strip to dismiss it on that screen. A new alert brings it back.",
    cta: { label: "Choose your alerts", path: "/household/#settings/alerts" },
    image: { file: "alerts", alt: "A red weather warning strip across the top of the wall dashboard" },
  },
  {
    id: "wall-ready",
    tier: "free",
    flags: [],
    subject: "Built to live on a wall",
    preheader: "Offline mode, burn-in protection and a page light enough for an old tablet.",
    title: "Built to live on a wall",
    intro: "A dashboard runs all day, every day. Everydaypane is made for that, on every plan.",
    points: [
      { text: "Light enough to run smoothly on an old tablet or a low-power panel." },
      { text: "If the WiFi drops, it keeps showing the last good data and says “Offline”." },
      { text: "Burn-in protection shifts the picture a few pixels now and then." },
      { text: "Day and night colours, so it's easy on the eyes after dark." },
    ],
    tip: "Settings changes reach the wall within 30 seconds. Household pushes them instantly.",
    cta: { label: "Check your screen settings", path: "/household/#settings/screen-care" },
    image: { file: "wall-ready", alt: "The dashboard in its night colours, dark and easy on the eyes" },
  },
  {
    id: "smart-home",
    tier: "household",
    flags: ["widget.haEntity"],
    subject: "Your smart home, one tap away",
    preheader: "Lights, thermostats and the doorbell camera, right on the kitchen wall.",
    title: "Your smart home, one tap away",
    intro: "Turn the wall into the house's control panel. Big, simple tiles anyone in the family can use.",
    points: [
      { text: "Lights with brightness and colour: Philips Hue, LIFX and Govee.", flag: "smartHome.hue" },
      { text: "Thermostats from Nest and ecobee, plus SmartThings devices.", flag: "smartHome.nest" },
      { text: "Home Assistant for everything else, with the doorbell camera popping up full screen.", flag: "smartHome.homeAssistant" },
      { text: "Spotify and Sonos: see what's playing, skip, change the volume.", flag: "widget.media" },
    ],
    tip: "Locks can only be locked from the wall, never unlocked, because anyone in the kitchen can reach it.",
    cta: { label: "Connect your devices", path: "/household/#settings/smart-home" },
    image: { file: "smart-home", alt: "Smart home tiles for lights, the thermostat and what's playing" },
  },
  {
    id: "out-the-door",
    tier: "household",
    flags: [],
    subject: "Leave on time, every time",
    preheader: "Drive times with traffic, the next bus, ferries and border waits before you grab your keys.",
    title: "Leave on time, every time",
    intro: "Glance at the wall on the way to the door and know whether you're early, late, or about to sit in traffic.",
    points: [
      { text: "Drive times with live traffic to work, school or practice, and when to leave.", flag: "widget.commute" },
      { text: "TransLink departures from your stops, counting down live.", flag: "widget.transit" },
      { text: "BC Ferries sailings and how full they are.", flag: "widget.ferries" },
      { text: "Border waits at the Lower Mainland crossings, and DriveBC highway cameras.", flag: "widget.borderWait" },
    ],
    cta: { label: "Add your places", path: "/household/#settings/commute" },
    image: { file: "out-the-door", alt: "Commute times, the next buses and ferry sailings" },
  },
  {
    id: "family-board",
    tier: "household",
    flags: ["widget.messages"],
    subject: "Leave a note on the fridge, minus the fridge",
    preheader: "A family message board you post to from your phone, and a whiteboard for doodles.",
    title: "Notes on the fridge, minus the fridge",
    intro: "“Running late, start dinner without me.” Post it from your phone and it's on the wall a moment later.",
    points: [
      { text: "Notes in a few colours, from anyone in the family." },
      { text: "Notes can expire by themselves, and pinned ones stay on top." },
      { text: "Let people post right from the wall, too." },
      { text: "A finger-drawing whiteboard that shows the same doodle on every screen.", flag: "widget.whiteboard" },
    ],
    cta: { label: "Open the message board", path: "/household/#messages" },
    image: { file: "family-board", alt: "Colourful family notes on the message board beside a whiteboard doodle" },
  },
  {
    id: "screen-saver",
    tier: "household",
    flags: [],
    subject: "A screen saver that's really a photo frame",
    preheader: "When nobody's around, the wall becomes a photo frame, or goes dark for the night.",
    title: "When nobody's looking",
    intro: "A dashboard doesn't need to show the bus times at midnight. The screen saver takes over when the room goes quiet.",
    points: [
      { text: "After a few minutes without a touch: photos only, a dark screen, or any view you design." },
      { text: "Make that view a photo frame with a small clock, and the wall becomes art." },
      { text: "Dark at night on a schedule. A tap wakes it, and never presses a button by accident." },
      { text: "Emergency alerts, the doorbell and timers still break through." },
    ],
    cta: { label: "Set up the screen saver", path: "/household/#settings/screen-saver" },
    image: { file: "screen-saver", alt: "A full-screen photo frame view with a small clock" },
  },
  {
    id: "timers",
    tier: "household",
    flags: ["widget.timer"],
    subject: "Kitchen timers you can hear across the room",
    preheader: "Start a timer with one tap. When it's done, the whole wall lets you know.",
    title: "Timers you can't miss",
    intro: "Hands covered in flour? Tap a preset and get on with it. When time's up, you'll know from the other room.",
    points: [
      { text: "One-tap presets, up to six timers at once, pause and +1 minute." },
      { text: "When one finishes, the wall flashes and beeps. Tap anywhere to stop it." },
      { text: "Timers keep ringing even if the wall switches views." },
      { text: "A separate pomodoro for homework: focus, break, repeat.", flag: "widget.pomodoro" },
    ],
    cta: { label: "Add timers", path: "/household/#views" },
    image: { file: "timers", alt: "A full-screen red alert saying the timer is done" },
  },
  {
    id: "house",
    tier: "household",
    flags: [],
    subject: "The house, at a glance",
    preheader: "Laundry done, the power stations, indoor air, the sprinklers and the internet, all on the wall.",
    title: "The whole house, at a glance",
    intro: "The things you'd normally open five apps for, quietly keeping you posted from the wall.",
    points: [
      { text: "The washer and dryer: time left, and a “done” notice so the towels don't sit.", flag: "widget.laundry" },
      { text: "Indoor air from Airthings: radon, CO₂ and particles, green to red.", flag: "widget.airthings" },
      { text: "EcoFlow power stations, Rachio sprinklers and your Blue Riiot pool.", flag: "widget.ecoflow" },
      { text: "Whether the internet is up, and how fast it really is.", flag: "widget.internet" },
    ],
    cta: { label: "Connect your home", path: "/household/#settings/laundry" },
    image: { file: "house", alt: "Laundry, indoor air and network status widgets" },
  },
  {
    id: "sports",
    tier: "household",
    flags: ["widget.sports"],
    subject: "Game on, right on the wall",
    preheader: "Live scores, last night's result and the next game for the teams you follow.",
    title: "Game on",
    intro: "Follow your teams without opening an app. The score is on the wall while the game is on.",
    points: [
      { text: "NHL, NBA, WNBA, NFL, MLB, MLS, the Premier League and the Champions League." },
      { text: "Up to 12 teams, each in its own colours." },
      { text: "A live score that flashes when someone scores." },
      { text: "Last night's result at breakfast, then the next game." },
    ],
    tip: "That's the end of the tour. Reply to any of these emails if there's something you wish the wall did.",
    cta: { label: "Pick your teams", path: "/household/#settings/sports" },
    image: { file: "sports", alt: "Live and upcoming scores for the Canucks and Whitecaps" },
  },
];

/** Local hour the emails go out (the dashboard's time zone), and the window they may go in. */
export const SEND_HOUR = 10;
const LATEST_HOUR = 20;
/** The first email waits an hour after sign-up so it lands after Clerk's own sign-in mail. */
const FIRST_DELAY_MS = 60 * 60 * 1000;
/** Only households created on or after the series shipped get it (older ones already know their way around). */
export const ONBOARDING_SINCE = Date.UTC(2026, 10, 26);

export interface SentStep {
  step: string;
  sentAt: number;
}

/** The email's steps after flags: whole emails whose flags are off go, and so do points whose flag is off. */
export function liveSteps(on: (flag: string) => boolean): OnboardingStep[] {
  return ONBOARDING.filter((s) => s.flags.every(on))
    .map((s) => ({ ...s, points: s.points.filter((p) => !p.flag || on(p.flag)) }))
    .filter((s) => s.points.length >= 2);
}

function local(at: number, timeZone: string): { day: string; hour: number } {
  const parts = zonedFormatter(timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

/**
 * The email to send now, if any. One a day: the first an hour after sign-up (between 8 AM and 9 PM local, else the
 * next morning at 10), each later one from 10 AM local on a day after the last. A run that's missed (the hourly job
 * failing) only delays the series; nothing is ever sent twice or two in a day.
 */
export function dueStep(
  steps: readonly OnboardingStep[],
  sent: readonly SentStep[],
  createdAt: number,
  timeZone: string,
  now: number,
): { step: OnboardingStep; n: number; total: number } | null {
  const done = new Set(sent.map((s) => s.step));
  const n = steps.findIndex((s) => !done.has(s.id));
  if (n < 0) return null;
  const here = local(now, timeZone);
  if (here.hour > LATEST_HOUR) return null;
  const last = Math.max(0, ...sent.map((s) => s.sentAt));
  if (last && local(last, timeZone).day >= here.day) return null;
  if (!sent.length) {
    if (now - createdAt < FIRST_DELAY_MS) return null;
    const sameDay = local(createdAt, timeZone).day === here.day;
    if (here.hour < (sameDay ? 8 : SEND_HOUR)) return null;
  } else if (here.hour < SEND_HOUR) return null;
  // The kicker counts what this household has had plus what's left, so a skipped email doesn't leave a gap.
  const total = sent.length + steps.filter((s) => !done.has(s.id)).length;
  return { step: steps[n]!, n: sent.length + 1, total };
}
