import type { Metadata } from "next";

import { Wordmark } from "@/components/Wordmark";

import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="card w-full max-w-sm">
        <h1>
          <Wordmark height={36} />
        </h1>
        <p className="mt-3 text-soft">We’ll email you a link to sign in.</p>
        <SignInForm />
      </div>
    </main>
  );
}
