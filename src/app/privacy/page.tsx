import type { Metadata } from "next";
import Link from "next/link";

import { Eyebrow, SitePage } from "@/components/site/SiteChrome";
import { BRAND } from "@/lib/brand";
import { pageMeta } from "@/lib/pageMeta";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = pageMeta({
  title: "Privacy",
  description: `How ${BRAND.name} handles household data, Google APIs, sign-in and secrets — no ads, no tracking cookies.`,
  path: "/privacy/",
});

// Privacy for Google's OAuth consent screen and public Free/Household accounts (updated 2026-11-23 for self-serve signup).
export default function PrivacyPage() {
  return (
    <SitePage>
      <Eyebrow>Legal</Eyebrow>
      <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight">Privacy</h1>
      <p className="mt-4 text-soft">
        {BRAND.name} is a wall dashboard for households. Anyone can create a Free household with an email address; the Household plan
        unlocks more widgets through Stripe. Each household&rsquo;s screens and settings stay private to that household.
      </p>

      <h2 className="mt-10 text-xl font-bold">Accounts and sign-in</h2>
      <ul className="mt-3 list-disc space-y-1 pl-6 text-soft">
        <li>Sign-in is by emailed magic link. Sign-in links and sessions are stored only as hashes.</li>
        <li>Creating a Free household stores the admin email and household name you provide.</li>
        <li>Household admins can invite family members by email for the message board, meals and shopping.</li>
        <li>Notes on the family message board show the name the writer types, never an email address.</li>
      </ul>

      <h2 className="mt-10 text-xl font-bold">Google Calendar</h2>
      <p className="mt-3 text-soft">
        When a household admin connects a Google account, {BRAND.name} asks for read-only access to its calendars (
        <code>calendar.readonly</code>). It uses that access only to show upcoming events on the household&rsquo;s own screens. It never
        creates, changes or deletes events, and it doesn&rsquo;t read email, contacts or anything else in the account.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-6 text-soft">
        <li>The access token is stored encrypted on our server and is never sent to a browser or a screen.</li>
        <li>Events are kept for a few minutes at most, so the screens don&rsquo;t ask Google on every refresh.</li>
        <li>Calendar data is never sold, shared, used for advertising, or used to train any model.</li>
        <li>
          Disconnecting in the household panel deletes the token and revokes it at Google. You can also remove access at{" "}
          <a className="text-brand underline" href="https://myaccount.google.com/permissions">
            myaccount.google.com/permissions
          </a>
          .
        </li>
      </ul>
      <p className="mt-3 text-soft">
        {BRAND.name}&rsquo;s use and transfer of information received from Google APIs adheres to the{" "}
        <a className="text-brand underline" href="https://developers.google.com/terms/api-services-user-data-policy">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <h2 className="mt-10 text-xl font-bold">Google Tasks</h2>
      <p className="mt-3 text-soft">
        If a household admin also connects Google Tasks, {BRAND.name} asks for access to the account&rsquo;s task lists (<code>tasks</code>
        ). It reads the open tasks of the lists the admin picks to show them on the household&rsquo;s screens, and marks a task done when
        someone ticks it off on a screen. It never creates, edits or deletes tasks or lists. Tasks are kept for a minute at most, and the
        same rules as for the calendar apply: the token stays encrypted on our server, and nothing is sold, shared or used to train any
        model.
      </p>

      <h2 className="mt-10 text-xl font-bold">Billing</h2>
      <p className="mt-3 text-soft">
        Household subscriptions are processed by Stripe. Card details are handled by Stripe; we store Stripe customer and subscription ids
        so we can unlock the plan and open the customer portal. See Stripe&rsquo;s privacy policy for how they process payments.
      </p>

      <h2 className="mt-10 text-xl font-bold">Everything else</h2>
      <ul className="mt-3 list-disc space-y-1 pl-6 text-soft">
        <li>Integration tokens (Google, Amazon cookies, Home Assistant, music and smart-home OAuth) are encrypted at rest.</li>
        <li>Error reports are scrubbed of email addresses and display links before they leave the server.</li>
        <li>There are no ads and no tracking cookies on the product or marketing site.</li>
        <li>
          We do not run third-party product analytics. Organic traffic may be reviewed in Google Search Console; paid conversions in Stripe;
          household counts in the platform admin.
        </li>
      </ul>

      <h2 className="mt-10 text-xl font-bold">Questions</h2>
      <p className="mt-3 text-soft">
        <a className="text-brand underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        . Also see the{" "}
        <Link href="/terms/" className="text-brand underline">
          terms of use
        </Link>
        .
      </p>
      <p className="mt-8 text-sm text-soft">Last updated November 23, 2026.</p>
    </SitePage>
  );
}
