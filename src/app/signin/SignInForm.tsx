"use client";

import { useEffect, useState } from "react";

const NEXT_KEY = "ep_signin_next";

/** Same-origin relative path only (open redirect guard). */
function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return null;
  return raw;
}

export function SignInForm({ next: forcedNext }: { next?: string } = {}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "sent" | "error"; message?: string }>({ kind: "idle" });

  useEffect(() => {
    const next = safeNext(forcedNext ?? new URLSearchParams(window.location.search).get("next"));
    if (next) sessionStorage.setItem(NEXT_KEY, next);
  }, [forcedNext]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "sending" });
    const r = await fetch("/api/auth/start/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
    setState(
      r.ok
        ? { kind: "sent", message: body.message ?? "Check your email." }
        : { kind: "error", message: body.error ?? "Something went wrong." },
    );
  }

  if (state.kind === "sent")
    return (
      <p className="mt-6 rounded-xl bg-bg p-4 text-sm" role="status">
        {state.message}
      </p>
    );
  return (
    <form onSubmit={submit} className="mt-6 grid gap-3">
      <label className="grid gap-1 text-sm font-medium">
        Email
        <input className="field" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button className="btn-primary" disabled={state.kind === "sending"}>
        {state.kind === "sending" ? "Sending…" : "Email me a link"}
      </button>
      {state.kind === "error" && (
        <p className="text-sm text-bad" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}

export { NEXT_KEY, safeNext };
