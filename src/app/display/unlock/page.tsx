import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { Wordmark } from "@/components/Wordmark";
import { DISPLAY_PATH } from "@/lib/site";
import { SESSION_COOKIE, sessionFor } from "@/server/auth";
import { tokenFromSealedCookie, WALL_COOKIE } from "@/server/displayAuth";

import { DisplayUnlock } from "./DisplayUnlock";

export const metadata: Metadata = { title: "Unlock display", robots: { index: false, follow: false } };

export default async function DisplayUnlockPage() {
  const jar = await cookies();
  const wallToken = await tokenFromSealedCookie(jar.get(WALL_COOKIE)?.value);
  if (wallToken) redirect(DISPLAY_PATH);

  const session = await sessionFor(jar.get(SESSION_COOKIE)?.value);

  return (
    <div className="site flex min-h-dvh flex-col bg-bg">
      <main className="grid flex-1 place-items-center px-4 py-12">
        <div className="card w-full max-w-md">
          <h1>
            <Wordmark height={36} />
          </h1>
          <p className="mt-3 text-soft">Unlock this screen for your household wall.</p>
          <DisplayUnlock signedInAs={session?.email ?? null} />
        </div>
      </main>
    </div>
  );
}
