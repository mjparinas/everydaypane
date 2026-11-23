import type { Metadata } from "next";

import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { Mark } from "@/components/Wordmark";

import { VerifyButton } from "./VerifyButton";

export const metadata: Metadata = { title: "Sign in" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="site flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="grid flex-1 place-items-center px-4 py-12">
        <div className="card w-full max-w-sm text-center">
          <Mark size={56} className="mx-auto mb-4" />
          <h1 className="text-2xl font-bold tracking-tight">Sign in to Everydaypane</h1>
          {token ? <VerifyButton token={token} /> : <p className="mt-4 text-soft">This link is missing its code. Ask for a new one.</p>}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
