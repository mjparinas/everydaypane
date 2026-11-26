import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { Wordmark } from "@/components/Wordmark";
import { SIGN_IN_PATH, SIGNUP_PATH } from "@/lib/site";

import { SignInForm, type SignInIntent } from "./SignInForm";

export const metadata: Metadata = { title: "Sign In" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ intent?: string; next?: string }> }) {
  const sp = await searchParams;
  const intent: SignInIntent = sp.intent === "signup" ? "signup" : "signin";
  const signup = intent === "signup";
  const next = typeof sp.next === "string" ? sp.next : undefined;

  return (
    <div className="site flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="grid flex-1 place-items-center px-4 py-12">
        <div className="card w-full max-w-sm">
          <h1>
            <Wordmark height={36} />
          </h1>
          <p className="mt-3 text-soft">
            {signup
              ? "Create a free household. We’ll email you a one-time code — no card needed."
              : "We’ll email you a one-time code to sign in."}
          </p>
          <SignInForm intent={intent} next={next} />
          {signup ? (
            <p className="mt-4 text-sm text-soft">
              Already have a household?{" "}
              <Link href={SIGN_IN_PATH} className="font-semibold text-brand hover:underline">
                Sign In
              </Link>
            </p>
          ) : (
            <p className="mt-4 text-sm text-soft">
              New here?{" "}
              <Link href={SIGNUP_PATH} className="font-semibold text-brand hover:underline">
                Start Free
              </Link>
            </p>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
