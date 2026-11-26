import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FamilyAuthProvider } from "@/components/FamilyAuth";
import { FamilyPhotos } from "@/components/FamilyPhotos";
import { MealPlanner } from "@/components/MealPlanner";
import { MessageBoard } from "@/components/MessageBoard";
import { ShoppingList } from "@/components/ShoppingList";
import { Mark } from "@/components/Wordmark";
import { deviceForToken } from "@/server/devices";

export const metadata: Metadata = { title: "Edit · Everydaypane" };

// Kitchen phone page (Melvin, 2026-11-22): open `/d/<token>/edit/` (or scan the edit QR) to change meals, shopping
// and the message board with no magic-link sign-in. Auth is knowing this display's secret address.
export default async function DisplayEditPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const device = await deviceForToken(token);
  if (!device) notFound();

  return (
    <FamilyAuthProvider displayToken={token}>
      <main className="mx-auto grid max-w-5xl gap-4 p-4">
        <header className="flex items-center gap-3">
          <Mark size={32} />
          <div className="min-w-0">
            <h1 className="text-xl font-bold">Edit</h1>
            <p className="text-sm text-soft truncate">{device.name} · no sign-in needed</p>
          </div>
        </header>
        <p className="text-sm text-soft max-w-xl">
          Anyone who can open this link can change the meal plan, shopping list and message board, and add photos to albums open to the
          family. Keep the QR on the wall, not shared online.
        </p>
        <p className="text-sm">
          <a className="font-semibold text-brand underline-offset-2 hover:underline" href={`/d/${token}/chores/`}>
            Kids Chores →
          </a>
        </p>
        <section className="mx-auto grid w-full max-w-xl gap-3" aria-labelledby="messages-heading">
          <h2 id="messages-heading" className="text-lg font-bold">
            Message Board
          </h2>
          <MessageBoard />
        </section>
        <FamilyPhotos />
        <section className="grid gap-3" aria-labelledby="meals-heading">
          <h2 id="meals-heading" className="text-lg font-bold">
            Meal Plan
          </h2>
          <MealPlanner />
        </section>
        <section className="mx-auto grid w-full max-w-xl gap-3" aria-labelledby="shopping-heading">
          <h2 id="shopping-heading" className="text-lg font-bold">
            Shopping List
          </h2>
          <ShoppingList />
        </section>
      </main>
    </FamilyAuthProvider>
  );
}
