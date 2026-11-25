"use client";

import { useEffect, useState } from "react";

import { safeNext } from "@/lib/safeNext";

const NEXT_KEY = "ep_signin_next";

export type SignInIntent = "signin" | "signup";

/**
 * Magic-link form. `signup` creates a Free household for a new email (`POST /api/auth/signup/`);
 * existing members still get a normal link. Plain `signin` never creates accounts.
 */
export function SignInForm({
  next: forcedNext,
  intent = "signin",
}: {
  next?: string;
  intent?: SignInIntent;
} = {}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "sent" | "error"; message?: string }>({ kind: "idle" });
  const signup = intent === "signup";

  useEffect(() => {
    const next = safeNext(forcedNext ?? new URLSearchParams(window.location.search).get("next"));
    if (next) sessionStorage.setItem(NEXT_KEY, next);
  }, [forcedNext]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "sending" });
    const url = signup ? "/api/auth/signup/" : "/api/auth/start/";
    const next = safeNext(forcedNext ?? new URLSearchParams(window.location.search).get("next") ?? sessionStorage.getItem(NEXT_KEY));
    const body = signup ? { email, name: name.trim() || undefined, next: next ?? undefined } : { email, next: next ?? undefined };
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const res = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
    setState(
      r.ok
        ? { kind: "sent", message: res.message ?? "Check your email." }
        : { kind: "error", message: res.error ?? "Something went wrong." },
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
      {signup ? (
        <label className="grid gap-1 text-sm font-medium">
          Household name
          <input
            className="field"
            type="text"
            name="name"
            autoComplete="organization"
            maxLength={80}
            placeholder="Home"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      ) : null}
      <label className="grid gap-1 text-sm font-medium">
        Email
        <input className="field" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button className="btn-primary" disabled={state.kind === "sending"}>
        {state.kind === "sending" ? "Sending…" : signup ? "Create free household" : "Email me a link"}
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
