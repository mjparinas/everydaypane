import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { FamilyEvents } from "@/components/FamilyEvents";
import { MealPlanner } from "@/components/MealPlanner";
import { MessageBoard } from "@/components/MessageBoard";
import { ShoppingList } from "@/components/ShoppingList";
import { Mark } from "@/components/Wordmark";
import { SESSION_COOKIE, sessionFor } from "@/server/auth";

import { SignOut } from "./SignOut";

export const metadata: Metadata = { title: "Family" };

// The family's page (FAMILY_EMAILS): the message board, the meal plan and the shopping list, made for a phone.
export default async function FamilyPage() {
  const session = await sessionFor((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect("/signin/?next=/family/");
  return (
    <main className="mx-auto grid max-w-xl gap-4 p-4">
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
      <MessageBoard />
      <FamilyEvents />
      <section className="grid gap-3" aria-labelledby="meals-heading">
        <h2 id="meals-heading" className="text-lg font-bold">
          Meal plan
        </h2>
        <MealPlanner />
      </section>
      <section className="grid gap-3" aria-labelledby="shopping-heading">
        <h2 id="shopping-heading" className="text-lg font-bold">
          Shopping list
        </h2>
        <ShoppingList />
      </section>
    </main>
  );
}
