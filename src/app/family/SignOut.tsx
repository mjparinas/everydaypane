"use client";

import { useRouter } from "next/navigation";

export function SignOut() {
  const router = useRouter();
  return (
    <button
      className="btn-ghost"
      onClick={() => {
        void fetch("/api/auth/signout/", { method: "POST" }).then(() => router.replace("/signin/"));
      }}
    >
      Sign out
    </button>
  );
}
