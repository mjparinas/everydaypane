"use client";

import { useState } from "react";

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
      window.location.replace(body.role === "admin" ? "/admin/" : "/family/");
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
