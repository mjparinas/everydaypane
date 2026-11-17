import type { Metadata } from "next";

import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="card w-full max-w-sm">
        <h1 className="text-2xl font-bold tracking-tight">Everydaypane</h1>
        <p className="mt-1 text-soft">We’ll email you a link to sign in.</p>
        <SignInForm />
      </div>
    </main>
  );
}
