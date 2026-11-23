"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { APP_PATH, FAMILY_PATH } from "@/lib/site";

import { NEXT_KEY, safeNext } from "./SignInForm";

type StartBody = {
  ok?: boolean;
  code?: string;
  pollSecret?: string;
  expiresAt?: number;
  phoneUrl?: string;
  qrSvg?: string;
  error?: string;
};

type PollBody = {
  status?: "pending" | "ready" | "expired" | "claimed";
  handoff?: string;
  role?: string;
  error?: string;
};

/**
 * Tuned-style "sign in with your phone" for wall panels and TVs without an email app: show a QR + short code,
 * poll until the phone approves, then claim a session cookie on this browser.
 */
export function PhoneQrSignIn() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [qrSvg, setQrSvg] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"idle" | "waiting" | "signing" | "done">("idle");
  const pollSecret = useRef("");
  const expiresAt = useRef(0);

  const finish = useCallback(async (handoff: string, role?: string) => {
    setStatus("signing");
    const r = await fetch("/api/auth/device/claim/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handoff }),
    });
    const body = (await r.json().catch(() => ({}))) as { role?: string; error?: string };
    if (!r.ok) {
      setStatus("waiting");
      setError(body.error ?? "Couldn't finish signing in. Try a new code.");
      return;
    }
    setStatus("done");
    const next = safeNext(sessionStorage.getItem(NEXT_KEY));
    sessionStorage.removeItem(NEXT_KEY);
    window.location.replace(next ?? (body.role === "admin" || role === "admin" ? APP_PATH : FAMILY_PATH));
  }, []);

  const start = useCallback(async () => {
    setError("");
    setStatus("waiting");
    const r = await fetch("/api/auth/device/start/", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const body = (await r.json().catch(() => ({}))) as StartBody;
    if (!r.ok || !body.code || !body.pollSecret || !body.qrSvg) {
      setStatus("idle");
      setError(body.error ?? "Couldn't start phone sign-in.");
      return;
    }
    setCode(body.code);
    setQrSvg(body.qrSvg);
    pollSecret.current = body.pollSecret;
    expiresAt.current = body.expiresAt ?? Date.now() + 600_000;
  }, []);

  function openPhoneSignIn() {
    setOpen(true);
    void start();
  }

  useEffect(() => {
    if (!open || status !== "waiting" || !code || !pollSecret.current) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (Date.now() > expiresAt.current) {
        setError("That code expired.");
        void start();
        return;
      }
      const r = await fetch("/api/auth/device/poll/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, pollSecret: pollSecret.current }),
      });
      const body = (await r.json().catch(() => ({}))) as PollBody;
      if (cancelled) return;
      if (body.status === "ready" && body.handoff) {
        await finish(body.handoff, body.role);
        return;
      }
      if (body.status === "expired" || body.status === "claimed") {
        setError(body.status === "claimed" ? "Already signed in." : "That code expired.");
        void start();
      }
    };
    const id = window.setInterval(() => void tick(), 2000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [open, status, code, start, finish]);

  if (!open) {
    return (
      <div className="mt-6 border-t border-line pt-5">
        <button type="button" className="btn-ghost w-full" onClick={openPhoneSignIn}>
          Sign in with your phone
        </button>
        <p className="mt-2 text-center text-xs text-soft">For wall panels and TVs without an email app. Scan a QR on your phone.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-line pt-5">
      <h2 className="text-sm font-semibold">Sign in with your phone</h2>
      <p className="mt-1 text-sm text-soft">Scan the code, sign in on your phone, then tap Approve. This screen finishes by itself.</p>
      {qrSvg ? (
        // eslint-disable-next-line @next/next/no-img-element -- inline SVG data URL from our own start route
        <img
          className="mx-auto mt-4 h-44 w-44 rounded-lg bg-white p-2"
          src={`data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`}
          alt="QR code to approve this display on your phone"
        />
      ) : (
        <div className="mx-auto mt-4 grid h-44 w-44 place-items-center rounded-lg bg-bg text-sm text-soft">Loading…</div>
      )}
      <p className="mt-3 text-center font-mono text-2xl font-bold tracking-widest" aria-live="polite">
        {code || "————"}
      </p>
      <p className="mt-1 text-center text-xs text-soft">
        {status === "signing" ? "Signing in…" : status === "done" ? "Signed in." : "Waiting for your phone…"}
      </p>
      {error && (
        <p className="mt-2 text-center text-sm text-bad" role="alert">
          {error}
        </p>
      )}
      <div className="mt-4 grid gap-2">
        <button type="button" className="btn-ghost" onClick={() => void start()} disabled={status === "signing"}>
          New code
        </button>
        <button
          type="button"
          className="text-sm text-soft underline"
          onClick={() => {
            setOpen(false);
            setStatus("idle");
            setCode("");
            setQrSvg("");
            setError("");
          }}
        >
          Use email instead
        </button>
      </div>
    </div>
  );
}
