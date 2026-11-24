"use client";

import { useState } from "react";

import { safeNext } from "@/lib/safeNext";
import { APP_PATH, FAMILY_PATH } from "@/lib/site";

import { NEXT_KEY } from "../SignInForm";

// The link only signs in when this button is pressed, so mail scanners that open links don't use it up.
export function VerifyButton({ token }: { token: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    const r = await fetch("/api/auth/verify/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const body = (await r.json().catch(() => ({}))) as { role?: string; error?: string };
    if (r.ok) {
      const fromQuery = safeNext(new URLSearchParams(window.location.search).get("next"));
      const fromStore = safeNext(sessionStorage.getItem(NEXT_KEY));
      sessionStorage.removeItem(NEXT_KEY);
      window.location.replace(fromQuery ?? fromStore ?? (body.role === "admin" ? APP_PATH : FAMILY_PATH));
      return;
    }
    setBusy(false);
    setError(body.error ?? "That didn't work. Ask for a new link.");
  }

  return (
    <div className="mt-6 grid gap-3">
      <button className="btn-primary" onClick={go} disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      {error && (
        <p className="text-sm text-bad" role="alert">
          {error}{" "}
          <a className="underline" href="/signin/">
            Get a new link
          </a>
        </p>
      )}
    </div>
  );
}
