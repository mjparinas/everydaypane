"use client";

import { useState } from "react";

import { formatDeviceCode, normalizeDeviceCode } from "@/lib/deviceSignIn";

import { SignInForm } from "../SignInForm";

export function PhoneApprove({ initialCode, signedInAs }: { initialCode: string | null; signedInAs: string | null }) {
  const [code, setCode] = useState(initialCode ?? "");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "done" | "error"; message?: string }>({ kind: "idle" });

  const normalized = normalizeDeviceCode(code);
  const display = normalized ? formatDeviceCode(normalized) : code;

  async function approve() {
    if (!normalized) {
      setState({ kind: "error", message: "That code isn't valid. Check the display and try again." });
      return;
    }
    setState({ kind: "sending" });
    const r = await fetch("/api/auth/device/approve/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: normalized }),
    });
    const body = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
    if (!r.ok) {
      setState({ kind: "error", message: body.error ?? "Couldn't approve that display." });
      return;
    }
    setState({ kind: "done", message: body.message ?? "Approved. The display is signing in now." });
  }

  if (!signedInAs) {
    const next = normalized ? `/signin/phone/?code=${encodeURIComponent(formatDeviceCode(normalized))}` : "/signin/phone/";
    return (
      <div className="mt-4">
        <p className="text-sm text-soft">Sign in on this phone first, then you can approve the display.</p>
        {!normalized && (
          <label className="mt-4 grid gap-1 text-sm font-medium">
            Code on the display
            <input
              className="field font-mono tracking-widest"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="K7QF-29MD"
              autoComplete="one-time-code"
              inputMode="text"
            />
          </label>
        )}
        {normalized && (
          <p className="mt-3 text-center font-mono text-xl font-bold tracking-widest" aria-live="polite">
            {display}
          </p>
        )}
        <SignInForm next={next} />
      </div>
    );
  }

  if (state.kind === "done") {
    return (
      <p className="mt-6 rounded-xl bg-bg p-4 text-sm" role="status">
        {state.message}
      </p>
    );
  }

  return (
    <div className="mt-4 grid gap-3">
      <p className="text-sm text-soft">
        Signed in as <span className="font-medium text-ink">{signedInAs}</span>. Approve this display to finish signing it in.
      </p>
      <label className="grid gap-1 text-sm font-medium">
        Code on the display
        <input
          className="field font-mono tracking-widest"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="K7QF-29MD"
          autoComplete="one-time-code"
          inputMode="text"
        />
      </label>
      <button type="button" className="btn-primary" disabled={state.kind === "sending"} onClick={() => void approve()}>
        {state.kind === "sending" ? "Approving…" : "Approve this display"}
      </button>
      {state.kind === "error" && (
        <p className="text-sm text-bad" role="alert">
          {state.message}
        </p>
      )}
    </div>
  );
}
