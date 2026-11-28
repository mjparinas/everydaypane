import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FamilyAuthProvider } from "@/components/FamilyAuth";
import { FamilyHub } from "@/components/FamilyHub";
import { FamilyPhotos } from "@/components/FamilyPhotos";
import { MealPlanner } from "@/components/MealPlanner";
import { MessageBoard } from "@/components/MessageBoard";
import { ShoppingList } from "@/components/ShoppingList";
import { Whiteboard } from "@/components/Whiteboard";
import { Mark } from "@/components/Wordmark";
import { deviceForToken } from "@/server/devices";

export const metadata: Metadata = { title: "Edit · Everydaypane" };

// Kitchen phone page (Melvin, 2026-11-22): open `/d/<token>/edit/` (or scan the edit QR) to change meals, shopping
// and the message board with no magic-link sign-in. Auth is knowing this display's secret address. One list at a time
// in tabs (FamilyHub, Melvin, 2026-11-28: "seems a bit busy and not easy to use").
export default async function DisplayEditPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const device = await deviceForToken(token);
  if (!device) notFound();

  return (
    <FamilyAuthProvider displayToken={token}>
      <main className="mx-auto grid max-w-5xl gap-4 p-4 pb-28 md:pb-8">
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Mark size={32} />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold">{device.name}</h1>
              <p className="text-sm text-soft">Edit the wall</p>
            </div>
          </div>
          <a className="btn-ghost shrink-0" href={`/d/${token}/chores/`}>
            Chores
          </a>
        </header>
        <FamilyHub
          tabs={[
            { id: "messages", label: "Messages", content: <MessageBoard /> },
            { id: "shopping", label: "Shopping", content: <ShoppingList /> },
            { id: "meals", label: "Meals", wide: true, content: <MealPlanner /> },
            { id: "draw", label: "Draw", content: <Whiteboard /> },
            { id: "photos", label: "Photos", content: <FamilyPhotos /> },
          ]}
          footer={
            <p className="mx-auto w-full max-w-xl pt-4 text-xs text-soft">
              No sign-in needed: anyone with this link can make changes. Keep the QR on the wall, not shared online.
            </p>
          }
        />
      </main>
    </FamilyAuthProvider>
  );
}
