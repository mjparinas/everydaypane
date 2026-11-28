"use client";

import { useClerk } from "@clerk/nextjs";
import { useState } from "react";

import { nativePlugin } from "@/lib/nativeApp";

// Delete Account (Melvin, 2026-11-28, App Store guideline 5.1.1(v)) on Settings › Home and the Family page, so
// everyone who can sign in can find it, in the app or a browser. Two steps: the first shows exactly what will go
// (households deleted with everything in them, households only left), the second needs DELETE typed.

interface Plan {
  deleteHouseholds: { id: string; name: string; paid: boolean }[];
  leaveHouseholds: { id: string; name: string }[];
  blocked: "staff" | null;
}

export function DeleteAccount({ className = "" }: { className?: string }) {
  const clerkReady = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_"));
  return clerkReady ? <WithClerk className={className} /> : <DeleteAccountCard className={className} signOut={() => Promise.resolve()} />;
}

function WithClerk({ className }: { className: string }) {
  const { signOut } = useClerk();
  return <DeleteAccountCard className={className} signOut={() => signOut().catch(() => undefined)} />;
}

function DeleteAccountCard({ className, signOut }: { className: string; signOut: () => Promise<void> }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true);
    setError("");
    const r = await fetch("/api/account/").catch(() => null);
    setBusy(false);
    if (!r?.ok) return setError("Couldn't check your account. Try again.");
    setPlan(((await r.json()) as { plan: Plan }).plan);
  }

  async function confirm() {
    setBusy(true);
    setError("");
    const r = await fetch("/api/account/", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: "DELETE" }),
    }).catch(() => null);
    if (!r?.ok) {
      setBusy(false);
      const body = (await r?.json().catch(() => null)) as { error?: string } | null;
      return setError(body?.error ?? "Couldn't delete your account. Try again.");
    }
    await nativePlugin()
      ?.clearSession()
      .catch(() => undefined);
    await signOut();
    window.location.replace("/?deleted=1");
  }

  return (
    <section className={`grid gap-3 rounded-2xl border border-line bg-panel p-4 ${className}`} aria-labelledby="delete-account-heading">
      <h2 id="delete-account-heading" className="text-lg font-bold">
        Delete Account
      </h2>
      {!plan ? (
        <>
          <p className="text-sm text-soft">Remove your sign-in and your Everydaypane data for good.</p>
          <button type="button" className="btn-ghost justify-self-start text-bad" disabled={busy} onClick={() => void start()}>
            {busy ? "Checking…" : "Delete Account…"}
          </button>
        </>
      ) : plan.blocked ? (
        <p className="text-sm text-soft">
          This account is managed by Everydaypane. To close it, write to us from the{" "}
          <a className="font-semibold text-brand underline-offset-2 hover:underline" href="/contact/">
            Contact page
          </a>
          .
        </p>
      ) : (
        <div className="grid gap-3 text-sm">
          {plan.deleteHouseholds.map((h) => (
            <p key={h.id}>
              <strong>{h.name}</strong> will be deleted with everything in it: settings, displays, messages, meals, shopping, chores and
              photos.{h.paid ? " Its Household plan is cancelled and won't be charged again." : ""}
            </p>
          ))}
          {plan.leaveHouseholds.map((h) => (
            <p key={h.id}>
              You’ll leave <strong>{h.name}</strong>. It keeps going for everyone else, and your notes on the board stay.
            </p>
          ))}
          <p className="text-soft">This can’t be undone. Type DELETE to confirm.</p>
          <input
            className="field max-w-xs"
            aria-label="Type DELETE to confirm"
            autoComplete="off"
            autoCapitalize="characters"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn bg-bad text-white hover:brightness-110"
              disabled={busy || typed.trim().toUpperCase() !== "DELETE"}
              onClick={() => void confirm()}
            >
              {busy ? "Deleting…" : "Delete My Account"}
            </button>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => (setPlan(null), setTyped(""))}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
