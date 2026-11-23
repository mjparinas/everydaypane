import type { Metadata } from "next";
import { cookies } from "next/headers";

import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { Wordmark } from "@/components/Wordmark";
import { formatDeviceCode, normalizeDeviceCode } from "@/lib/deviceSignIn";
import { SESSION_COOKIE, sessionFor } from "@/server/auth";

import { PhoneApprove } from "./PhoneApprove";

export const metadata: Metadata = { title: "Approve display" };

export default async function PhoneSignInPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code: raw } = await searchParams;
  const normalized = normalizeDeviceCode(raw ?? "");
  const initialCode = normalized ? formatDeviceCode(normalized) : raw?.trim() || null;
  const jar = await cookies();
  const session = await sessionFor(jar.get(SESSION_COOKIE)?.value);

  return (
    <div className="site flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="grid flex-1 place-items-center px-4 py-12">
        <div className="card w-full max-w-sm">
          <h1>
            <Wordmark height={36} />
          </h1>
          <p className="mt-3 text-soft">Approve the Everydaypane display that showed this code.</p>
          <PhoneApprove initialCode={initialCode} signedInAs={session?.email ?? null} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
