import type { Metadata } from "next";
import Link from "next/link";

import { CtaBanner, Eyebrow, SitePage } from "@/components/site/SiteChrome";
import { pageMeta } from "@/lib/pageMeta";

export const metadata: Metadata = pageMeta({
  title: "Features",
  description:
    "Every Everydaypane widget and display behaviour: calendars, photos, chores, meals, TransLink, Home Assistant, BC alerts and more.",
  path: "/features/",
});

const GROUPS: { title: string; items: { name: string; blurb: string }[] }[] = [
  {
    title: "Time & weather",
    items: [
      { name: "Clock", blurb: "Digital or analogue, any time zone, seconds optional." },
      { name: "Date", blurb: "Today's date in a chosen zone." },
      { name: "Sunrise & sunset", blurb: "Open-Meteo times and daylight length." },
      { name: "Weather", blurb: "Current, hourly, up to 7 days, UV and pollen." },
      { name: "Air quality", blurb: "AQHI or US AQI." },
      { name: "Rain radar", blurb: "Environment Canada observed + forecast over a map." },
      { name: "Earth wind map", blurb: "earth.nullschool.net centred on your place." },
    ],
  },
  {
    title: "Family planning",
    items: [
      { name: "Schedule", blurb: "Today or the next 1–14 days from Google, iCal and family events." },
      { name: "Month calendar", blurb: "Month or 1–6 weeks, weekends on/off, fit titles, scroll." },
      { name: "Countdowns", blurb: "Holidays, birthdays and events; yearly ones roll over." },
      { name: "To-dos", blurb: "Google Tasks with tap-to-tick and undo." },
      { name: "Chore chart", blurb: "Kids, stars, weekly goals, fair rotation." },
      { name: "Meals", blurb: "Breakfast, lunch, dinner for a day or a week." },
      { name: "Shopping list", blurb: "Groceries from phones; tap to tick on the wall." },
      { name: "Message board", blurb: "Family notes from /family/." },
      { name: "Note", blurb: "Fixed text from the admin." },
      { name: "WiFi QR", blurb: "Join code, optional password." },
    ],
  },
  {
    title: "Getting around (BC)",
    items: [
      { name: "TransLink", blurb: "Live departures from up to six stops." },
      { name: "Commute", blurb: "Drive times with traffic and leave-by." },
      { name: "BC Ferries", blurb: "Next sailings and how full they are." },
      { name: "Garbage day", blurb: "Township of Langley Recycle Coach zones." },
      { name: "School status", blurb: "Open, closed, delayed or late start." },
    ],
  },
  {
    title: "Home & media",
    items: [
      { name: "Home Assistant", blurb: "Lights, climate, covers, lock (lock only), buttons." },
      { name: "Camera", blurb: "UniFi Protect snapshots on a timer." },
      { name: "Music", blurb: "HA, Spotify or Sonos now-playing controls." },
      { name: "Who's home", blurb: "Person and device trackers, read only." },
      { name: "Photos", blurb: "Amazon, Google Photos picks, library uploads." },
      { name: "Sports scores", blurb: "Live score, last result, next game." },
      { name: "Timers & pomodoro", blurb: "Kitchen timers and focus rounds on-device." },
      { name: "Alerts", blurb: "Alert Ready, weather, roads, quakes, BC Hydro." },
    ],
  },
  {
    title: "Display behaviour",
    items: [
      { name: "Multi-view grid", blurb: "Rows, columns, gap, edge and tile padding." },
      { name: "Widgets on photos", blurb: "Photos as backdrop; panels stay readable." },
      { name: "Time-of-day schedule", blurb: "Morning to night views, themes and dimming." },
      { name: "Screen saver", blurb: "Photos or dark; motion, doorbell and alert wake." },
      { name: "Offline + burn-in", blurb: "Service worker cache and pixel shift." },
      { name: "Live admin editor", blurb: "Real widgets under a drag overlay on your phone." },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <SitePage wide>
      <Eyebrow>Features</Eyebrow>
      <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Everything on the pane</h1>
      <p className="mt-4 max-w-2xl text-lg text-soft">
        Free includes the essentials on one display.{" "}
        <Link href="/pricing/" className="font-semibold text-brand hover:underline">
          Family
        </Link>{" "}
        unlocks every widget below.
      </p>
      <div className="mt-12 space-y-12">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="font-display text-2xl font-extrabold tracking-tight">{g.title}</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {g.items.map((item) => (
                <li key={item.name} className="card">
                  <h3 className="font-bold">{item.name}</h3>
                  <p className="mt-1 text-sm text-soft">{item.blurb}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="mt-14">
        <CtaBanner
          cta="features-end"
          title="Build your first view"
          body="Drag widgets onto a 12×8 grid from your phone in a few minutes."
        />
      </div>
    </SitePage>
  );
}
