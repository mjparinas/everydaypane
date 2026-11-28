import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppHome } from "@/components/AppHome";
import { signInHref } from "@/lib/site";
import { nameCase } from "@/lib/titleCase";
import { currentHouseholdSession, SESSION_COOKIE } from "@/server/auth";

export const metadata: Metadata = { title: "Everydaypane", robots: { index: false, follow: false } };

// Where the Everydaypane app opens (capacitor.config.json server.url and the web app's start_url). Since Melvin,
// 2026-11-28 ("the mobile app should prioritize sending messages to the wall, editing todo lists, shopping cart, etc,
// basically anything on the edit screen"), it is the quick-edit home for everyone, admins included, with Household one
// tap away; a phone that isn't signed in goes to sign-in and comes back here.
export default async function AppStart() {
  const session = await currentHouseholdSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect(signInHref("/app/"));
  const first = session.name?.trim().split(/\s+/)[0];
  return <AppHome isAdmin={session.role === "admin"} name={first ? nameCase(first) : null} />;
}
