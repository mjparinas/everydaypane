import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { KidsChores } from "@/components/KidsChores";
import { Mark } from "@/components/Wordmark";
import { currentHouseholdSession, SESSION_COOKIE } from "@/server/auth";

import { SignOut } from "../SignOut";

export const metadata: Metadata = { title: "Chores · Family" };

// Signed-in family kids chores page (Melvin, 2026-11-23). Same UI as `/d/<token>/chores/`.
export default async function FamilyChoresPage() {
  const session = await currentHouseholdSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect("/signin/?next=/family/chores/");
  return (
    <main className="mx-auto grid max-w-xl gap-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <Mark size={32} />
          <h1 className="text-xl font-bold">Chores</h1>
        </div>
        <div className="flex shrink-0 gap-2 whitespace-nowrap">
          <Link className="btn-ghost" href="/family/">
            Family
          </Link>
          <SignOut />
        </div>
      </header>
      <KidsChores />
    </main>
  );
}
