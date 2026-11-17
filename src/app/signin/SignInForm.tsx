"use client";

import { useState } from "react";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "sent" | "error"; message?: string }>({ kind: "idle" });

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
