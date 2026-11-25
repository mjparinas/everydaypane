"use client";

import { ClerkProvider as ClerkRoot } from "@clerk/nextjs";
import type { ReactNode } from "react";

/** Wraps the app when Clerk publishable key is present; otherwise a no-op for AUTH_TEST_MODE builds. */
export function AppClerkProvider({ children }: { children: ReactNode }) {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!key?.startsWith("pk_")) return <>{children}</>;
  return (
    <ClerkRoot
      signInUrl="/signin"
      signUpUrl="/signin"
      signInFallbackRedirectUrl="/household/"
      signUpFallbackRedirectUrl="/household/"
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
