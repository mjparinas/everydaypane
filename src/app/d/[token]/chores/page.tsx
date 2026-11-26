import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FamilyAuthProvider } from "@/components/FamilyAuth";
import { KidsChores } from "@/components/KidsChores";
import { Mark } from "@/components/Wordmark";
import { deviceForToken } from "@/server/devices";

export const metadata: Metadata = { title: "Chores · Everydaypane" };

// Kids phone chore page (Melvin, 2026-11-23): open `/d/<token>/chores/` to pick a name and tick today's chores with
// no magic-link sign-in. Auth is knowing this display's secret address (same idea as `/edit/`).
export default async function DisplayChoresPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const device = await deviceForToken(token);
  if (!device) notFound();

  return (
    <FamilyAuthProvider displayToken={token}>
      <main className="mx-auto grid max-w-xl gap-4 p-4">
        <header className="flex items-center gap-3">
          <Mark size={32} />
          <div className="min-w-0">
            <h1 className="text-xl font-bold">Chores</h1>
            <p className="truncate text-sm text-soft">{device.name} · no sign-in needed</p>
          </div>
        </header>
        <p className="text-sm text-soft">
          Pick your name, tick off today&apos;s chores, and spend stars on rewards. Parents set the chart in Household › Settings › Chores.
        </p>
        <KidsChores />
        <p className="text-xs text-soft">
          <a className="underline-offset-2 hover:underline" href={`/d/${token}/edit/`}>
            Edit Meals & Shopping
          </a>
        </p>
      </main>
    </FamilyAuthProvider>
  );
}
