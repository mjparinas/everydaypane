import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { NativeAppBridge } from "@/components/NativeApp";
import { ShareInbox } from "@/components/ShareInbox";
import { Mark } from "@/components/Wordmark";
import { currentHouseholdSession, SESSION_COOKIE } from "@/server/auth";

export const metadata: Metadata = { title: "Share · Family" };

// Where the app lands after "Share to Everydaypane" from Photos, a browser or Notes (Melvin, 2026-11-27): photos go to
// the wall's photo frame, text and links to the shopping list or the meal plan.
export default async function FamilySharePage() {
  const session = await currentHouseholdSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect("/signin/?next=/family/share/");
  return (
    <main className="mx-auto grid max-w-xl gap-4 p-4">
      <NativeAppBridge />
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <Mark size={32} />
          <h1 className="text-xl font-bold">Share</h1>
        </div>
        <Link className="btn-ghost" href="/family/">
          Family
        </Link>
      </header>
      <ShareInbox />
    </main>
  );
}
