import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { MessageBoard } from "@/components/MessageBoard";
import { Mark } from "@/components/Wordmark";
import { SESSION_COOKIE, sessionFor } from "@/server/auth";

import { SignOut } from "./SignOut";

export const metadata: Metadata = { title: "Message board" };

// The family's page (FAMILY_EMAILS): just the message board, made for a phone.
export default async function FamilyPage() {
  const session = await sessionFor((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect("/signin/?next=/family/");
  return (
    <main className="mx-auto grid max-w-xl gap-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <Mark size={32} />
          <h1 className="text-xl font-bold">Message board</h1>
        </div>
        <div className="flex shrink-0 gap-2 whitespace-nowrap">
          {session.role === "admin" && (
            <a className="btn-ghost" href="/admin/">
              Admin
            </a>
          )}
          <SignOut />
        </div>
      </header>
      <MessageBoard />
    </main>
  );
}
