import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DeleteAccount } from "@/components/DeleteAccount";
import { FamilyEvents } from "@/components/FamilyEvents";
import { FamilyHub } from "@/components/FamilyHub";
import { FamilyPhotos } from "@/components/FamilyPhotos";
import { InstallPrompt } from "@/components/InstallPrompt";
import { MealPlanner } from "@/components/MealPlanner";
import { MessageBoard } from "@/components/MessageBoard";
import { NativeAppBridge, ThisPhoneCard } from "@/components/NativeApp";
import { ShoppingList } from "@/components/ShoppingList";
import { Whiteboard } from "@/components/Whiteboard";
import { Mark } from "@/components/Wordmark";
import { currentHouseholdSession, SESSION_COOKIE } from "@/server/auth";

import { SignOut } from "./SignOut";

export const metadata: Metadata = { title: "Family" };

// The family's page (FAMILY_EMAILS): the message board, calendar, shopping, meals, whiteboard and photos, made for a
// phone, one list at a time in tabs (FamilyHub, Melvin, 2026-11-28).
export default async function FamilyPage() {
  const session = await currentHouseholdSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect("/signin/?next=/family/");
  return (
    <main className="mx-auto grid max-w-5xl gap-4 p-4 pb-28 md:pb-8">
      <NativeAppBridge />
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <Mark size={32} />
          <h1 className="text-xl font-bold">Family</h1>
        </div>
        <div className="flex shrink-0 gap-2 whitespace-nowrap">
          <a className="btn-ghost" href="/family/chores/">
            Chores
          </a>
          {session.role === "admin" && (
            <a className="btn-ghost" href="/household/">
              Household
            </a>
          )}
        </div>
      </header>
      <InstallPrompt />
      <FamilyHub
        tabs={[
          { id: "messages", label: "Messages", content: <MessageBoard /> },
          { id: "calendar", label: "Calendar", content: <FamilyEvents /> },
          { id: "shopping", label: "Shopping", content: <ShoppingList /> },
          { id: "meals", label: "Meals", wide: true, content: <MealPlanner /> },
          { id: "draw", label: "Draw", content: <Whiteboard /> },
          { id: "photos", label: "Photos", content: <FamilyPhotos /> },
        ]}
        footer={
          <details className="group mx-auto mt-6 w-full max-w-xl border-t border-line pt-4">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-soft hover:text-ink">
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 transition-transform group-open:rotate-90"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
              Account &amp; This Phone
            </summary>
            <div className="grid gap-4 pt-2">
              <ThisPhoneCard />
              <SignOut />
              <DeleteAccount />
            </div>
          </details>
        }
      />
    </main>
  );
}
