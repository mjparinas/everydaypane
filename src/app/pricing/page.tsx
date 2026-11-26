import type { Metadata } from "next";
import Link from "next/link";

import { HouseholdCheckoutButton } from "@/components/site/CheckoutButtons";
import { Check, CtaBanner, Eyebrow, JsonLd, organizationJsonLd, SitePage } from "@/components/site/SiteChrome";
import { MARKETING_PLAN_TABLE, MARKETING_PLANS, usd } from "@/lib/marketingPlans";
import { pageMeta } from "@/lib/pageMeta";
import { SIGNUP_PATH, SITE_URL } from "@/lib/site";

export const metadata: Metadata = pageMeta({
  title: "Pricing",
  description:
    "Everydaypane Free vs Household. Start free with 2 displays; Household at $59/year unlocks every widget — best value, no ads.",
  path: "/pricing/",
});

export default function PricingPage() {
  const paid = MARKETING_PLANS.find((p) => p.id === "paid")!;
  return (
    <SitePage wide>
      <JsonLd
        data={[
          organizationJsonLd(),
          {
            "@context": "https://schema.org",
            "@type": "Product",
            name: "Everydaypane Household",
            description: paid.blurb,
            offers: {
              "@type": "Offer",
              price: String(paid.priceYearly),
              priceCurrency: "USD",
              url: `${SITE_URL}/pricing/`,
            },
          },
        ]}
      />
      <Eyebrow>Pricing</Eyebrow>
      <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Free forever. Household is the best value.</h1>
      <p className="mt-4 max-w-2xl text-lg text-soft">
        No ads on either plan. Pay yearly on Household and it works out to about {usd(paid.priceYearly / 12)} a month.
      </p>
      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        {MARKETING_PLANS.map((p) => (
          <article key={p.id} className={`card relative flex flex-col ${p.highlighted ? "border-brand ring-4 ring-brand/15" : ""}`}>
            {p.badge ? (
              <span className="absolute -top-3 right-5 rounded-full bg-brand px-3 py-1 text-xs font-bold text-white">{p.badge}</span>
            ) : null}
            <h2 className="font-display text-2xl font-extrabold">{p.name}</h2>
            <p className="mt-1 text-soft">{p.blurb}</p>
            <p className="mt-4 font-display text-4xl font-extrabold">
              {p.priceMonthly === 0 ? "$0" : usd(p.priceYearly)}
              {p.priceMonthly > 0 ? <span className="text-base font-semibold text-soft"> / year</span> : null}
            </p>
            {p.priceMonthly > 0 ? (
              <p className="text-sm text-soft">or {usd(p.priceMonthly)} / month</p>
            ) : (
              <p className="text-sm text-soft">2 displays · 1 view · essentials</p>
            )}
            <ul className="mt-5 flex-1 space-y-2 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check />
                  {f}
                </li>
              ))}
            </ul>
            {p.id === "paid" ? (
              <HouseholdCheckoutButton className="mt-6" label={p.cta} />
            ) : (
              <Link
                href={SIGNUP_PATH}
                className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl border border-line px-5 font-semibold"
              >
                {p.cta}
              </Link>
            )}
          </article>
        ))}
      </div>
      <div className="mt-12 overflow-x-auto rounded-2xl border border-line bg-panel">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <caption className="sr-only">Free vs Household Feature Comparison</caption>
          <thead className="border-b border-line bg-bg/80 text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Feature</th>
              <th className="px-4 py-3">Free</th>
              <th className="px-4 py-3 text-brand">Household</th>
            </tr>
          </thead>
          <tbody>
            {MARKETING_PLAN_TABLE.map((row) => (
              <tr key={row.feature} className="border-b border-line/70 last:border-0">
                <th className="px-4 py-3 font-medium">{row.feature}</th>
                <td className="px-4 py-3 text-soft">{typeof row.free === "string" ? row.free : row.free ? "✓" : "—"}</td>
                <td className="px-4 py-3 font-semibold">{typeof row.paid === "string" ? row.paid : row.paid ? "✓" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-14">
        <CtaBanner cta="pricing-end" title="Start on Free Today" body="Upgrade to Household when you want every widget on every screen." />
      </div>
    </SitePage>
  );
}
