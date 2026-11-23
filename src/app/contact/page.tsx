import type { Metadata } from "next";

import { Eyebrow, SitePage } from "@/components/site/SiteChrome";
import { pageMeta } from "@/lib/pageMeta";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = pageMeta({
  title: "Contact",
  description: "Email Everydaypane for support, Household plan questions or privacy requests.",
  path: "/contact/",
});

export default function ContactPage() {
  return (
    <SitePage>
      <Eyebrow>Contact</Eyebrow>
      <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight">Say hello</h1>
      <p className="mt-4 text-lg text-soft">
        For support, Household plan questions, privacy requests or press, email{" "}
        <a className="font-semibold text-brand underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        .
      </p>
      <p className="mt-6 text-soft">
        We built Everydaypane for kitchen walls in Langley, BC. If something on the wall is wrong, include your display name from the
        Displays tab and about when it happened.
      </p>
    </SitePage>
  );
}
