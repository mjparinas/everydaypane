import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { FamilyEvents } from "@/components/FamilyEvents";
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

// The family's page (FAMILY_EMAILS): the message board, the meal plan and the shopping list, made for a phone.
export default async function FamilyPage() {
  const session = await currentHouseholdSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect("/signin/?next=/family/");
  return (
    <main className="mx-auto grid max-w-5xl gap-4 p-4">
      <NativeAppBridge />
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <Mark size={32} />
          <h1 className="text-xl font-bold">Family</h1>
        </div>
        <div className="flex shrink-0 gap-2 whitespace-nowrap">
          {session.role === "admin" && (
            <a className="btn-ghost" href="/household/">
              Household
            </a>
          )}
          <SignOut />
        </div>
      </header>
      <InstallPrompt />
      <div className="mx-auto grid w-full max-w-xl gap-4">
        <MessageBoard />
        <FamilyEvents />
        <p className="text-sm">
          <a className="font-semibold text-brand underline-offset-2 hover:underline" href="/family/chores/">
            Kids Chores →
          </a>
        </p>
      </div>
      <section className="mx-auto grid w-full max-w-xl gap-3" aria-labelledby="whiteboard-heading">
        <h2 id="whiteboard-heading" className="text-lg font-bold">
          Whiteboard
        </h2>
        <Whiteboard />
      </section>
      <FamilyPhotos />
      <section className="grid gap-3" aria-labelledby="meals-heading">
        <h2 id="meals-heading" className="text-lg font-bold">
          Meal Plan
        </h2>
        <MealPlanner />
      </section>
      <ThisPhoneCard />
      <section className="mx-auto grid w-full max-w-xl gap-3" aria-labelledby="shopping-heading">
        <h2 id="shopping-heading" className="text-lg font-bold">
          Shopping List
        </h2>
        <ShoppingList />
      </section>
    </main>
  );
}
