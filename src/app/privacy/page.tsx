import type { Metadata } from "next";

import { Wordmark } from "@/components/Wordmark";

export const metadata: Metadata = { title: "Privacy" };

// The privacy policy Google's consent screen links to (needed to publish the OAuth app, 2026-11-17). Public, static,
// and written for the family and Google's reviewers alike.
export default function PrivacyPage() {
  return (
    <main className="mx-auto grid max-w-2xl gap-5 p-6 leading-relaxed">
      <Wordmark height={32} />
      <h1 className="text-2xl font-bold tracking-tight">Privacy</h1>
      <p>
        Everydaypane is a private wall dashboard for one family&rsquo;s home. It shows the time, weather, calendar, reminders and alerts on
        screens in the house. Only the family uses it; there are no public accounts.
      </p>

      <h2 className="text-lg font-semibold">Google Calendar</h2>
      <p>
        When a family admin connects a Google account, Everydaypane asks for read-only access to its calendars (
        <code>calendar.readonly</code>). It uses that access only to show upcoming events on the family&rsquo;s own screens. It never
        creates, changes or deletes events, and it doesn&rsquo;t read email, contacts or anything else in the account.
      </p>
      <ul className="list-disc space-y-1 pl-6">
        <li>The access token is stored encrypted on our server and is never sent to a browser or a screen.</li>
        <li>Events are kept for a few minutes at most, so the screens don&rsquo;t ask Google on every refresh.</li>
        <li>Calendar data is never sold, shared, used for advertising, or used to train any model.</li>
        <li>
          Disconnecting in the admin panel deletes the token and revokes it at Google. You can also remove access at any time at{" "}
          <a className="text-brand underline" href="https://myaccount.google.com/permissions">
            myaccount.google.com/permissions
          </a>
          .
        </li>
      </ul>
      <p>
        Everydaypane&rsquo;s use and transfer of information received from Google APIs adheres to the{" "}
        <a className="text-brand underline" href="https://developers.google.com/terms/api-services-user-data-policy">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <h2 className="text-lg font-semibold">Everything else</h2>
      <ul className="list-disc space-y-1 pl-6">
        <li>Sign-in is by emailed link, for addresses the family has listed. Sign-in links and sessions are stored only as hashes.</li>
        <li>Notes on the family message board show the name the writer types, never an email address.</li>
        <li>Error reports are scrubbed of email addresses and screen links before they leave the server.</li>
        <li>There are no ads, no analytics and no tracking cookies.</li>
      </ul>

      <h2 className="text-lg font-semibold">Questions</h2>
      <p>Write to the support address shown on Google&rsquo;s sign-in screen for Everydaypane.</p>
      <p className="text-sm text-soft">Last updated November 17, 2026.</p>
    </main>
  );
}
