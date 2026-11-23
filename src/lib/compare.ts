// Competitor facts for /compare/. Checked against vendor pages and third-party roundups on 2026-11-23.
// Names in text only (no logos). Fair where the other product is a better fit.

export interface Fact {
  text: string;
  source: string;
  /** ISO date the source was read. */
  checked: string;
}

export type Topic =
  "hardware" | "price" | "subscription" | "calendars" | "photos" | "chores" | "meals" | "smartHome" | "local" | "diy" | "touch" | "ads";

export const TOPIC_LABEL: Record<Topic, string> = {
  hardware: "Hardware",
  price: "Up-front cost",
  subscription: "Subscription",
  calendars: "Calendars",
  photos: "Photos",
  chores: "Chores & lists",
  meals: "Meals",
  smartHome: "Smart home",
  local: "Local life (BC / transit)",
  diy: "Setup & DIY",
  touch: "Touch on the wall",
  ads: "Ads",
};

export const OURS: Record<Topic, string> = {
  hardware: "Any browser: UniFi UC-Display21, tablet, TV or laptop. No appliance to buy.",
  price: "Software: Free plan $0. Household $7/mo or $59/yr. Use a screen you already own.",
  subscription: "Free forever for one display with essentials. Family unlocks every widget — best value.",
  calendars: "Google Calendar, Google Tasks and any iCal link, merged into schedule and month views.",
  photos: "Amazon shared albums and people, Google Photos picks, uploads to a private library, screen saver.",
  chores: "Recurring chore chart with stars and weekly goals; shopping list and message board from phones.",
  meals: "Breakfast, lunch and dinner planned from a phone, shown for a day or a week on the wall.",
  smartHome: "Home Assistant tiles, UniFi Protect cameras, doorbell pop-up, Spotify and Sonos, who's home.",
  local:
    "Township of Langley garbage, TransLink departures, commute with traffic, Environment Canada radar, BC Ferries, Alert Ready, DriveBC, earthquakes, BC Hydro outages, Langley school status.",
  diy: "Sign in, drag widgets on a 12×8 grid from your phone. No Raspberry Pi image and no config files.",
  touch: "Tap to tick chores, shopping and tasks; control lights and media; dismiss alerts. Locks can lock, never unlock.",
  ads: "No ads, ever.",
};

export interface Competitor {
  slug: string;
  name: string;
  summary: string;
  rows: Partial<Record<Topic, Fact[]>>;
  theirPick: string;
  ourEdge: string;
}

const CHECKED = "2026-11-23";

export const COMPETITORS: Competitor[] = [
  {
    slug: "dakboard",
    name: "DAKboard",
    summary: "A customizable cloud dashboard that runs on DAKboard's wall displays or on hardware you already own.",
    theirPick:
      "Choose DAKboard if you want the broadest catalogue of third-party blocks and are happy managing layouts and API quirks yourself.",
    ourEdge:
      "Everydaypane ships Canadian family integrations out of the box (TransLink, Langley garbage, BC Ferries, Alert Ready, BC Hydro) and a phone-first admin with live layout editing — without a separate player image.",
    rows: {
      hardware: [
        {
          text: "Wall Display Touch 22 from about $599.95 and Touch 27 from about $799.95, or free software on a browser, Raspberry Pi, tablet or TV.",
          source: "https://dakboard.com/",
          checked: CHECKED,
        },
      ],
      subscription: [
        {
          text: "Free tier; Essential about $5/mo billed yearly; Plus about $8/mo billed yearly (faster refresh, more screens).",
          source: "https://dakboard.com/pricing",
          checked: CHECKED,
        },
      ],
      calendars: [
        {
          text: "Google, iCloud, Microsoft 365 and ICS feeds; free plan limited to a small number of calendars.",
          source: "https://dakboard.com/pricing",
          checked: CHECKED,
        },
      ],
      smartHome: [
        {
          text: "SmartThings and Home Assistant integrations available on paid plans.",
          source: "https://dakboard.com/",
          checked: CHECKED,
        },
      ],
      local: [
        {
          text: "No first-party TransLink, Township of Langley garbage, BC Ferries or Alert Ready widgets.",
          source: "https://dakboard.com/",
          checked: CHECKED,
        },
      ],
      diy: [
        {
          text: "Visual editor in the cloud; Raspberry Pi player available. Layout and feed health are on you.",
          source: "https://dakboard.com/c/comparisons/dakboard-vs-magicmirror/",
          checked: CHECKED,
        },
      ],
      ads: [{ text: "No ads on the dashboard.", source: "https://dakboard.com/", checked: CHECKED }],
    },
  },
  {
    slug: "magicmirror",
    name: "MagicMirror²",
    summary: "A free, open-source mirror dashboard for Raspberry Pi, maintained by volunteers with a huge module ecosystem.",
    theirPick: "Choose MagicMirror if you enjoy Raspberry Pi projects, two-way glass builds and editing module config by hand.",
    ourEdge:
      "Everydaypane is a hosted product with a phone admin, touch widgets and BC family data — no soldering, no config.js and no weekend spent recovering an SD card.",
    rows: {
      hardware: [
        {
          text: "Runs on a Raspberry Pi 2–5 with Raspberry Pi OS and a monitor; often paired with two-way glass.",
          source: "https://magicmirror.builders/",
          checked: CHECKED,
        },
      ],
      price: [
        {
          text: "Software is free; you buy the Pi, display, frame and power yourself.",
          source: "https://docs.magicmirror.builders/",
          checked: CHECKED,
        },
      ],
      subscription: [{ text: "None.", source: "https://magicmirror.builders/", checked: CHECKED }],
      calendars: [
        {
          text: "iCal modules are common; multi-person colour setups need community modules.",
          source: "https://dakboard.com/c/comparisons/dakboard-vs-magicmirror/",
          checked: CHECKED,
        },
      ],
      touch: [
        {
          text: "Designed to sit behind glass; touch needs custom wiring and is not the default experience.",
          source: "https://dakboard.com/c/comparisons/dakboard-vs-magicmirror/",
          checked: CHECKED,
        },
      ],
      diy: [
        {
          text: "Install via terminal; customize by editing config files and installing community modules.",
          source: "https://docs.magicmirror.builders/",
          checked: CHECKED,
        },
      ],
      ads: [{ text: "No ads.", source: "https://magicmirror.builders/", checked: CHECKED }],
    },
  },
  {
    slug: "skylight",
    name: "Skylight Calendar",
    summary: "A purpose-built family calendar appliance with a companion app, chores and an optional Plus plan.",
    theirPick:
      "Choose Skylight if you want a sealed appliance that just works on the counter and nobody in the house wants to configure a dashboard.",
    ourEdge:
      "Everydaypane runs on a screen you already own, includes smart-home and BC transit widgets Skylight does not, and keeps meals, chores and photos on one Household plan without buying a $300–$600 device.",
    rows: {
      hardware: [
        {
          text: 'Calendar 2 about $299.99 (15"); Calendar 10 about $149.99; Calendar Max about $599.99 (27").',
          source: "https://myskylight.com/",
          checked: CHECKED,
        },
      ],
      subscription: [
        {
          text: "Core calendar, tasks, lists and chores free; Skylight Plus about $79/year for meals, rewards, photo screensaver and Magic Import.",
          source: "https://skylight.zendesk.com/hc/en-us/articles/36009559376795-Does-Skylight-Calendar-require-a-subscription",
          checked: CHECKED,
        },
      ],
      calendars: [
        {
          text: "Google, Outlook, Apple, Cozi and Yahoo.",
          source: "https://cast-hub.com/family-calendar-display/",
          checked: CHECKED,
        },
      ],
      meals: [
        {
          text: "Meal planning is a Plus feature.",
          source: "https://skylight.zendesk.com/hc/en-us/articles/57327250122395-About-Skylight-Plus",
          checked: CHECKED,
        },
      ],
      photos: [
        {
          text: "Photo and video screensaver requires Plus.",
          source: "https://skylight.zendesk.com/hc/en-us/articles/36009559376795-Does-Skylight-Calendar-require-a-subscription",
          checked: CHECKED,
        },
      ],
      smartHome: [
        {
          text: "Not a Home Assistant or UniFi Protect dashboard.",
          source: "https://myskylight.com/",
          checked: CHECKED,
        },
      ],
      local: [
        {
          text: "No TransLink, Langley garbage, BC Ferries or Environment Canada radar.",
          source: "https://myskylight.com/",
          checked: CHECKED,
        },
      ],
      ads: [{ text: "No ads on the calendar.", source: "https://myskylight.com/", checked: CHECKED }],
    },
  },
  {
    slug: "echo-show",
    name: "Amazon Echo Show",
    summary: 'Amazon\'s smart display: Alexa, video calls, widgets and Fire TV features on 15" and 21" models.',
    theirPick:
      "Choose an Echo Show if Alexa, video calling and Fire TV are already the centre of your kitchen, and a family calendar is a secondary widget.",
    ourEdge:
      "Everydaypane is a dedicated family dashboard you design once — not a rotating Alexa home screen — with chores, meals, BC transit and Home Assistant that Echo Show does not match.",
    rows: {
      hardware: [
        {
          text: "Echo Show 15 and Echo Show 21; street prices fluctuate; wall mounts often in the box.",
          source: "https://www.amazon.com/",
          checked: CHECKED,
        },
      ],
      subscription: [
        {
          text: "No calendar subscription; Prime and Alexa services optional.",
          source: "https://cast-hub.com/family-calendar-display/",
          checked: CHECKED,
        },
      ],
      calendars: [
        {
          text: "Alexa-linked Google, Microsoft and iCloud calendars; shared family calendar support varies by profile.",
          source: "https://calendarvision.app/blog/skylight-calendar-alternatives",
          checked: CHECKED,
        },
      ],
      chores: [
        {
          text: "Lists and reminders exist; not a Skylight-style chore chart with stars.",
          source: "https://calendarvision.app/blog/skylight-calendar-alternatives",
          checked: CHECKED,
        },
      ],
      smartHome: [
        {
          text: "Deep Alexa and Matter device control; not Home Assistant native.",
          source: "https://www.amazon.com/",
          checked: CHECKED,
        },
      ],
      ads: [
        {
          text: "Amazon promotional content can appear on Echo Show home screens depending on settings and region.",
          source: "https://www.amazon.com/",
          checked: CHECKED,
        },
      ],
    },
  },
  {
    slug: "hearth",
    name: "Hearth Display",
    summary: "A large portrait family display focused on routines, rewards and child independence.",
    theirPick: "Choose Hearth if a tall portrait screen and child routines are the main reason you're shopping.",
    ourEdge:
      "Everydaypane costs far less up front (bring your own screen), includes transit and smart-home widgets Hearth does not, and does not require a membership trial to finish setup.",
    rows: {
      hardware: [
        {
          text: '27" touch wall display, list price about $699.',
          source: "https://cast-hub.com/family-calendar-display/",
          checked: CHECKED,
        },
      ],
      subscription: [
        {
          text: "About $9/mo or $86.40/yr; a trial is used during setup; calendar and profiles remain if cancelled.",
          source: "https://cast-hub.com/family-calendar-display/",
          checked: CHECKED,
        },
      ],
      calendars: [
        {
          text: "Google, iCal/Apple and Outlook; some Outlook paths can lag hours.",
          source: "https://cast-hub.com/family-calendar-display/",
          checked: CHECKED,
        },
      ],
      local: [
        {
          text: "No BC-specific transit, ferry or emergency alert widgets.",
          source: "https://cast-hub.com/family-calendar-display/",
          checked: CHECKED,
        },
      ],
    },
  },
  {
    slug: "cozyla",
    name: "Cozyla Calendar",
    summary: 'Android-based family calendar displays from 15.6" to 32", with free core features and optional memberships.',
    theirPick: "Choose Cozyla if you want a large Android wall tablet that can also run other apps.",
    ourEdge:
      "Everydaypane separates the software from the hardware so you are not locked into one OEM panel, and it includes Home Assistant, UniFi cameras and BC transit that Cozyla's calendar focus does not cover.",
    rows: {
      hardware: [
        {
          text: 'Neo about $349.99 (15.6"); Plus 24 about $699.99; Plus 32 from about $899.99.',
          source: "https://cast-hub.com/family-calendar-display/",
          checked: CHECKED,
        },
      ],
      subscription: [
        {
          text: "Free core on many models; Essential about $79.99/yr and Super about $69.99/yr unlock extras on Neo.",
          source: "https://cast-hub.com/family-calendar-display/",
          checked: CHECKED,
        },
      ],
      smartHome: [
        {
          text: "Android apps can extend the device; not a first-party Home Assistant wall.",
          source: "https://cast-hub.com/family-calendar-display/",
          checked: CHECKED,
        },
      ],
    },
  },
];

export function competitor(slug: string): Competitor | undefined {
  return COMPETITORS.find((c) => c.slug === slug);
}
