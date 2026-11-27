import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { signInHref } from "@/lib/site";
import { currentHouseholdSession, SESSION_COOKIE } from "@/server/auth";

export const metadata: Metadata = { title: "Everydaypane", robots: { index: false, follow: false } };

// Where the Everydaypane app opens (capacitor.config.json server.url, Melvin, 2026-11-27): household admins land on
// Household, everyone else on Family, and a phone that isn't signed in goes to sign-in and comes back here.
export default async function AppStart() {
  const session = await currentHouseholdSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect(signInHref("/app/"));
  redirect(session.role === "admin" ? "/household/" : "/family/");
}
