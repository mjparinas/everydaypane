"use client";

import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

import { signOutThisPhone } from "@/components/NativeApp";
import { signInHref } from "@/lib/site";

export function SignOut() {
  const clerkReady = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_"));
  return clerkReady ? <ClerkSignOut /> : <TestSignOut />;
}

function TestSignOut() {
  const router = useRouter();
  return (
    <button
      className="btn-ghost"
      onClick={() => {
        void signOutThisPhone()
          .then(() => fetch("/api/auth/signout/", { method: "POST" }))
          .then(() => router.replace("/signin/"));
      }}
    >
      Sign Out
    </button>
  );
}

function ClerkSignOut() {
  const router = useRouter();
  const { signOut } = useClerk();
  return (
    <button
      className="btn-ghost"
      onClick={() => {
        void signOutThisPhone()
          .then(() => signOut({ redirectUrl: signInHref() }))
          .catch(() => router.replace(signInHref()));
      }}
    >
      Sign Out
    </button>
  );
}
