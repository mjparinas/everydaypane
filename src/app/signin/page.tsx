import type { Metadata } from "next";

import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { Wordmark } from "@/components/Wordmark";

import { PhoneQrSignIn } from "./PhoneQrSignIn";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div className="site flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="grid flex-1 place-items-center px-4 py-12">
        <div className="card w-full max-w-sm">
          <h1>
            <Wordmark height={36} />
          </h1>
          <p className="mt-3 text-soft">We’ll email you a link to sign in.</p>
          <SignInForm />
          <PhoneQrSignIn />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
