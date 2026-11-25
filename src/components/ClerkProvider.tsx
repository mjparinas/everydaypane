"use client";

import { ClerkProvider as ClerkRoot } from "@clerk/nextjs";
import type { ReactNode } from "react";

import { SITE_URL } from "@/lib/site";

/** Wraps the app when Clerk publishable key is present; otherwise a no-op for AUTH_TEST_MODE builds. */
export function AppClerkProvider({ children }: { children: ReactNode }) {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!key?.startsWith("pk_")) return <>{children}</>;
  const signInUrl = process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL?.trim() || "/signin";
  const signUpUrl = process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL?.trim() || "/signin";
  // A relative fallback on the Account Portal host would stay on accounts.everydaypane.com.
  const after = signInUrl.startsWith("http") ? `${SITE_URL}/household/` : "/household/";
  return (
    <ClerkRoot
      signInUrl={signInUrl}
      signUpUrl={signUpUrl}
      signInFallbackRedirectUrl={after}
      signUpFallbackRedirectUrl={after}
      appearance={{
        variables: {
          colorPrimary: "#3b5bdb",
          borderRadius: "0.75rem",
          fontFamily: "Manrope Variable, Manrope, system-ui, sans-serif",
        },
      }}
    >
      {children}
    </ClerkRoot>
  );
}
