import type { Metadata } from "next";
import Link from "next/link";

import { Eyebrow, SitePage } from "@/components/site/SiteChrome";
import { BRAND } from "@/lib/brand";
import { pageMeta } from "@/lib/pageMeta";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = pageMeta({
  title: "Terms of Use",
  description: `Terms for using ${BRAND.name}: acceptable use, accounts, the Free and Household plans, and liability limits.`,
  path: "/terms/",
});

export default function TermsPage() {
  return (
    <SitePage>
      <Eyebrow>Legal</Eyebrow>
      <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight">Terms of Use</h1>
      <p className="mt-4 text-soft">
        These terms cover the {BRAND.name} website and service at this domain. By signing in or opening a display link, you agree to them.
      </p>

      <h2 className="mt-10 text-xl font-bold">The Service</h2>
      <p className="mt-3 text-soft">
        {BRAND.name} is a wall dashboard and admin for a household. It is provided &ldquo;as is.&rdquo; Features may change as we ship
        updates; the blog&rsquo;s release notes describe what is new.
      </p>

      <h2 className="mt-10 text-xl font-bold">Accounts</h2>
      <p className="mt-3 text-soft">
        Anyone may create a Free household with a working email address. You are responsible for who you invite as family members and for
        keeping display links private. Do not share a display address publicly.
      </p>

      <h2 className="mt-10 text-xl font-bold">Plans</h2>
      <p className="mt-3 text-soft">
        The Free plan covers two displays, one view and two calendars with the essential widgets. The Household plan unlocks the full widget
        set and higher limits, as described on the{" "}
        <Link href="/pricing/" className="text-brand underline">
          pricing page
        </Link>
        . Prices are in US dollars unless we say otherwise. Household is sold through Stripe Checkout; you manage the card, invoices and
        cancellation in Stripe&rsquo;s customer portal (also linked from Settings › Plan). Plan limits are enforced from your
        household&rsquo;s plan in our database.
      </p>

      <h2 className="mt-10 text-xl font-bold">Acceptable Use</h2>
      <ul className="mt-3 list-disc space-y-1 pl-6 text-soft">
        <li>Use {BRAND.name} for your household (or households you administer), not as a public kiosk for strangers.</li>
        <li>Do not attempt to access another family&rsquo;s data, scrape private APIs, or abuse rate limits.</li>
        <li>Do not use the wall to unlock locks or bypass home security — locks can lock, never unlock, by design.</li>
        <li>Respect third-party terms for Google, Amazon, Home Assistant, TransLink, TomTom, Spotify, Sonos and others you connect.</li>
      </ul>

      <h2 className="mt-10 text-xl font-bold">Your Content</h2>
      <p className="mt-3 text-soft">
        You keep ownership of calendars, photos, meals, messages and other content you connect or type. You grant us permission to process
        that content only to run the dashboard for your household, as described in the{" "}
        <Link href="/privacy/" className="text-brand underline">
          privacy policy
        </Link>
        .
      </p>

      <h2 className="mt-10 text-xl font-bold">Third-Party Services</h2>
      <p className="mt-3 text-soft">
        Weather, transit, ferries, sports, maps and other feeds come from third parties. Their availability and accuracy are outside our
        control. One failing source should not hide the others, but we do not guarantee uptime of upstream APIs.
      </p>

      <h2 className="mt-10 text-xl font-bold">Liability</h2>
      <p className="mt-3 text-soft">
        To the fullest extent allowed by law, {BRAND.name} is not liable for indirect, incidental or consequential damages, or for decisions
        you make from information on the wall (traffic, ferries, weather, school status or alerts). Emergency alerts are a convenience layer
        — not a replacement for official warning systems.
      </p>

      <h2 className="mt-10 text-xl font-bold">Contact</h2>
      <p className="mt-3 text-soft">
        <a className="text-brand underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
      </p>
      <p className="mt-8 text-sm text-soft">Last updated November 23, 2026.</p>
    </SitePage>
  );
}
