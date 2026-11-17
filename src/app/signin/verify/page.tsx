import type { Metadata } from "next";

import { VerifyButton } from "./VerifyButton";

export const metadata: Metadata = { title: "Sign in" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="card w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold tracking-tight">Sign in to Everydaypane</h1>
        {token ? <VerifyButton token={token} /> : <p className="mt-4 text-soft">This link is missing its code. Ask for a new one.</p>}
      </div>
    </main>
  );
}
