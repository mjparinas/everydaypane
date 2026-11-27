"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { APP_PATH, signUpHref } from "@/lib/site";

/** Household upgrade via existing Stripe Checkout (`/api/household/billing/`). */
export function HouseholdCheckoutButton({
  className = "",
  label = "Get Household",
  interval = "year",
}: {
  className?: string;
  label?: string;
  /** The pricing cards lead with the yearly price; the server falls back to monthly when no yearly price is set. */
  interval?: "month" | "year";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/household/billing/?action=checkout&interval=${interval}`, { method: "POST" });
      if (r.status === 401) {
        router.push(signUpHref("/pricing/"));
        return;
      }
      const j = (await r.json()) as { url?: string; error?: string };
      if (r.status === 503) {
        router.push(APP_PATH);
        return;
      }
      if (!r.ok || !j.url) {
        setError(j.error ?? "Couldn't start checkout");
        return;
      }
      // Stripe Checkout is on another origin.
      window.location.assign(j.url);
    } catch {
      setError("Couldn't start checkout");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        data-cta="household-checkout"
        disabled={busy}
        onClick={() => void go()}
        className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-brand px-5 font-semibold text-brand-ink"
      >
        {busy ? "Opening…" : label}
      </button>
      {error ? (
        <p className="mt-2 text-sm text-bad" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
