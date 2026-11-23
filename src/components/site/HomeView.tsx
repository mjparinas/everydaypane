import Link from "next/link";

import { Wordmark } from "@/components/Wordmark";
import { latestPosts } from "@/content/posts";
import { BRAND } from "@/lib/brand";
import { faqJsonLd, HOME_FAQS } from "@/lib/faqs";
import { MARKETING_PLAN_TABLE, MARKETING_PLANS, usd } from "@/lib/marketingPlans";
import { pageMeta } from "@/lib/pageMeta";
import { SIGNUP_PATH, SITE_URL } from "@/lib/site";

import { HouseholdCheckoutButton } from "./CheckoutButtons";
import { PaneMock } from "./PaneMock";
import { Check, CtaBanner, Eyebrow, JsonLd, organizationJsonLd, SiteFooter, SiteHeader } from "./SiteChrome";

export const homeMetadata = pageMeta({
  title: `${BRAND.name}: ${BRAND.tagline}`,
  absoluteTitle: true,
  shareTitle: `${BRAND.name}: your home, at a glance`,
  description: BRAND.lede,
  path: "/",
});

const FEATURES = [
  {
    title: "The week, on one wall",
    body: "Google Calendar, iCal links and family events share a today schedule and a month grid. Tap Google Tasks to tick them off — synced back with a four-second undo.",
    shot: "morning" as const,
  },
  {
    title: "Chores, meals and the list",
    body: "Kids earn stars on the chore chart. Breakfast, lunch and dinner plan from a phone. The shopping list ticks off with a tap when you allow it.",
    shot: "family" as const,
  },
  {
    title: "Leaving the house, sorted",
    body: "Next buses from your TransLink stops, drive times with live traffic, rain radar over the Lower Mainland and BC Ferries sailings with how full they are.",
    shot: "commute" as const,
  },
  {
    title: "Photos as the backdrop",
    body: "Amazon albums, Google Photos picks and your own library fill the wall. Other widgets sit on top with a readable panel, and a screen saver keeps the kitchen calm at night.",
    shot: "photos" as const,
  },
];

const VALUE = [
  {
    title: 'Fewer "what time is…?" questions',
    body: "Clocks for Vancouver and Toronto, the date, sunrise and sunset, and today's calendar sit where everyone walks past.",
  },
  {
    title: "Kids can see their jobs",
    body: "Chores rotate fairly, stars add up to a weekly goal, and a second tap takes a tick back — no nagging app on a phone they ignore.",
  },
  {
    title: "The house talks back",
    body: "Home Assistant lights, climate and locks (lock only), UniFi doorbell full-screen, Spotify or Sonos now-playing, and who's home.",
  },
  {
    title: "Built for here",
    body: "Langley garbage zones, SD35 school status, Alert Ready, Environment Canada warnings, DriveBC, earthquakes and BC Hydro outages on a dismissible red strip.",
  },
];

const ALL_WIDGETS = [
  "Clock",
  "Date",
  "Sunrise & sunset",
  "Weather",
  "Air quality",
  "WiFi QR",
  "Countdowns",
  "Schedule",
  "Month calendar",
  "Garbage day",
  "Photos",
  "Home Assistant",
  "Camera",
  "Music",
  "Note",
  "Message board",
  "Meals",
  "Shopping list",
  "Who's home",
  "School status",
  "Alerts",
  "Chore chart",
  "Sports scores",
  "To-dos",
  "TransLink",
  "Commute",
  "Rain radar",
  "Timers",
  "Pomodoro",
  "BC Ferries",
  "Earth wind map",
];

export function HomeView() {
  const paid = MARKETING_PLANS.find((p) => p.id === "paid")!;
  const free = MARKETING_PLANS.find((p) => p.id === "free")!;
  const jsonLd = [
    organizationJsonLd(),
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: BRAND.name,
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Web",
      description: BRAND.lede,
      url: SITE_URL,
      offers: [
        { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
        {
          "@type": "Offer",
          name: "Household yearly",
          price: String(paid.priceYearly),
          priceCurrency: "USD",
        },
      ],
    },
    faqJsonLd(HOME_FAQS),
  ];

  return (
    <div className="site min-h-dvh">
      <JsonLd data={jsonLd} />
      <SiteHeader />
      <main>
        <section className="relative overflow-x-clip">
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pt-12 pb-16 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pt-16">
            <div className="site-rise">
              <Wordmark height={40} className="mb-5" />
              <Eyebrow>Family wall dashboard</Eyebrow>
              <h1 className="mt-4 font-display text-[2.55rem] leading-[1.05] font-extrabold tracking-tight text-balance sm:text-6xl">
                Your home, <span className="bg-gradient-to-r from-brand to-sky bg-clip-text text-transparent">at a glance.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-soft sm:text-xl">{BRAND.lede}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href={SIGNUP_PATH}
                  data-cta="hero"
                  className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-brand px-7 text-lg font-semibold text-brand-ink shadow-[0_12px_40px_-12px_rgb(59_91_219/0.7)]"
                >
                  Start free
                </Link>
                <a
                  href="#screens"
                  data-cta="hero-screens"
                  className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-line bg-panel px-6 text-lg font-semibold"
                >
                  See the screens
                </a>
              </div>
              <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-soft">
                {["Free plan, no ads", "Optimized for speed", "Any browser, any screen"].map((c) => (
                  <li key={c} className="flex gap-1.5">
                    <Check />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <div className="site-rise" style={{ animationDelay: "80ms" }}>
              <PaneMock variant="morning" priority />
            </div>
          </div>
        </section>

        <section aria-label="Everydaypane at a glance" className="border-y border-line bg-panel/70">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-9 text-center sm:grid-cols-4">
            {[
              { value: "30+", label: "widgets on the wall" },
              { value: "Fast", label: "optimized for the wall" },
              { value: "0", label: "ads, ever" },
              { value: "Live", label: "calendars, weather & photos" },
            ].map((f) => (
              <div key={f.label}>
                <dt className="sr-only">{f.label}</dt>
                <dd className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{f.value}</dd>
                <dd className="mt-1 text-sm text-soft">{f.label}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <Eyebrow>Three steps</Eyebrow>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">From sign-in to a living wall</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                n: "1",
                t: "Open the admin on your phone",
                d: "Magic-link sign-in. Drag widgets onto a 12×8 grid sized for 1920×1080, with live preview as you edit.",
              },
              {
                n: "2",
                t: "Connect what you already use",
                d: "Google Calendar and Tasks, photos, Home Assistant, TransLink stops, sports teams, commute places — each from Settings.",
              },
              {
                n: "3",
                t: "Hang a display address",
                d: "Each screen gets a secret /d/ link. It follows morning, afternoon, evening and night views, and polls for changes every 30 seconds.",
              },
            ].map((s) => (
              <li key={s.n} className="card relative overflow-hidden">
                <span className="font-display text-4xl font-extrabold text-brand/25">{s.n}</span>
                <h3 className="mt-2 text-lg font-bold">{s.t}</h3>
                <p className="mt-2 text-sm text-soft">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="screens" className="border-y border-line bg-panel/40 py-16">
          <div className="mx-auto max-w-6xl px-4">
            <Eyebrow>On the wall</Eyebrow>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              Colourful screens the whole family reads
            </h2>
            <p className="mt-3 max-w-2xl text-soft">
              Real starter layouts from the Views tab — the same screenshots families pick when they set up a wall.
            </p>
            <div className="mt-10 grid gap-10 lg:gap-14">
              {FEATURES.map((f, i) => (
                <div key={f.title} className={`grid items-center gap-8 lg:grid-cols-2 ${i % 2 ? "lg:[&>figure]:order-first" : ""}`}>
                  <div>
                    <h3 className="font-display text-2xl font-extrabold tracking-tight">{f.title}</h3>
                    <p className="mt-3 text-soft">{f.body}</p>
                  </div>
                  <PaneMock variant={f.shot} />
                </div>
              ))}
            </div>
            <div className="mt-12">
              <PaneMock variant="night" />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <Eyebrow>Why families keep it up</Eyebrow>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Value you feel before breakfast</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {VALUE.map((v) => (
              <article key={v.title} className="card">
                <h3 className="text-lg font-bold">{v.title}</h3>
                <p className="mt-2 text-sm text-soft">{v.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-line bg-gradient-to-b from-panel/80 to-bg py-16">
          <div className="mx-auto max-w-6xl px-4">
            <Eyebrow>Everything on the pane</Eyebrow>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Widgets, listed</h2>
            <p className="mt-3 max-w-2xl text-soft">
              Thirty-plus widget types, each with its own settings. Free covers the essentials; Household unlocks the rest.
            </p>
            <ul className="mt-8 flex flex-wrap gap-2">
              {ALL_WIDGETS.map((w) => (
                <li key={w} className="rounded-full border border-line bg-panel px-3.5 py-1.5 text-sm font-semibold">
                  {w}
                </li>
              ))}
            </ul>
            <p className="mt-6">
              <Link href="/features/" className="font-semibold text-brand hover:underline">
                Full feature list →
              </Link>
            </p>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl px-4 py-16">
          <Eyebrow>Pricing</Eyebrow>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Start free. Household is the best value.</h2>
          <p className="mt-3 max-w-2xl text-soft">
            No ads on either plan. Household is about {usd(paid.priceYearly / 12)} a month when you pay yearly.
          </p>
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {[free, paid].map((p) => (
              <article
                key={p.id}
                className={`card relative flex flex-col ${p.highlighted ? "border-brand shadow-[0_0_0_1px_var(--color-brand)] ring-4 ring-brand/15" : ""}`}
              >
                {p.badge ? (
                  <span className="absolute -top-3 right-5 rounded-full bg-gradient-to-r from-brand to-sky px-3 py-1 text-xs font-bold text-white">
                    {p.badge}
                  </span>
                ) : null}
                <h3 className="font-display text-xl font-extrabold">{p.name}</h3>
                <p className="mt-1 text-soft">{p.blurb}</p>
                <p className="mt-4 font-display text-4xl font-extrabold tracking-tight">
                  {p.priceMonthly === 0 ? (
                    "$0"
                  ) : (
                    <>
                      {usd(p.priceYearly)}
                      <span className="text-base font-semibold text-soft"> / year</span>
                    </>
                  )}
                </p>
                {p.priceMonthly > 0 ? (
                  <p className="text-sm text-soft">
                    or {usd(p.priceMonthly)} / month · save {usd(p.priceMonthly * 12 - p.priceYearly)} yearly
                  </p>
                ) : (
                  <p className="text-sm text-soft">Forever free · 2 displays · 1 view</p>
                )}
                <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {p.id === "paid" ? (
                  <HouseholdCheckoutButton className="mt-6" label={p.cta} />
                ) : (
                  <Link
                    href={SIGNUP_PATH}
                    data-cta={`pricing-${p.id}`}
                    className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl border border-line bg-bg px-5 font-semibold"
                  >
                    {p.cta}
                  </Link>
                )}
              </article>
            ))}
          </div>

          <div className="mt-12 overflow-x-auto rounded-2xl border border-line bg-panel">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <caption className="sr-only">Feature comparison between Free and Household</caption>
              <thead className="border-b border-line bg-bg/80 text-xs tracking-wide uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold">Feature</th>
                  <th className="px-4 py-3 font-semibold">Free</th>
                  <th className="px-4 py-3 font-semibold text-brand">Household · best value</th>
                </tr>
              </thead>
              <tbody>
                {MARKETING_PLAN_TABLE.map((row) => (
                  <tr key={row.feature} className="border-b border-line/70 last:border-0">
                    <th className="px-4 py-3 font-medium">{row.feature}</th>
                    <td className="px-4 py-3 text-soft">{cell(row.free)}</td>
                    <td className="px-4 py-3 font-semibold">{cell(row.paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-soft">
            Prefer a deeper look? See the{" "}
            <Link href="/pricing/" className="font-semibold text-brand hover:underline">
              pricing page
            </Link>{" "}
            and{" "}
            <Link href="/compare/" className="font-semibold text-brand hover:underline">
              how we compare
            </Link>{" "}
            to DAKboard, Skylight, MagicMirror and Echo Show.
          </p>
        </section>

        <section className="border-y border-line bg-panel/50 py-16">
          <div className="mx-auto max-w-6xl px-4">
            <Eyebrow>Blog</Eyebrow>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Updates, guides and comparisons</h2>
            <p className="mt-3 max-w-2xl text-soft">
              Release notes, setup guides and deep comparisons — written so families can find Everydaypane when they search.
            </p>
            <LatestPosts />
            <p className="mt-6">
              <Link href="/blog/" className="font-semibold text-brand hover:underline">
                All posts →
              </Link>
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-16">
          <Eyebrow>Good to know</Eyebrow>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight">Questions families ask</h2>
          <div className="mt-8 divide-y divide-line rounded-2xl border border-line bg-panel">
            {HOME_FAQS.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="cursor-pointer list-none font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-3">
                    {f.q}
                    <span className="text-soft transition group-open:rotate-45">+</span>
                  </span>
                </summary>
                <p className="mt-3 text-sm text-soft">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20">
          <CtaBanner
            cta="home-end"
            title="Hang your family's week on the wall"
            body="Start on Free in a few minutes. Upgrade to Household when you want every widget — still no ads."
          />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function cell(v: boolean | string) {
  if (typeof v === "string") return v;
  return v ? "✓" : "—";
}

function LatestPosts() {
  const posts = latestPosts(3);
  return (
    <ul className="mt-8 grid gap-4 md:grid-cols-3">
      {posts.map((p) => (
        <li key={p.slug}>
          <Link href={`/blog/${p.slug}/`} className="card block h-full hover:border-brand/50">
            <span className="text-xs font-bold tracking-wide text-brand uppercase">{p.tag}</span>
            <span className="mt-1 block font-bold tracking-tight">{p.title}</span>
            <span className="mt-2 block text-sm text-soft">{p.description}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
