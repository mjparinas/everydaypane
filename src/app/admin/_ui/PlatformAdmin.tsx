"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Mark } from "@/components/Wordmark";

type Household = {
  id: string;
  name: string;
  plan: string;
  createdAt: number;
  deviceCount: number;
  members: { email: string; role: string }[];
  hasStripe: boolean;
};

type Feed = { staff: { email: string }; households: Household[] };

const when = (t: number) => new Date(t).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });

/** Minimal platform panel (Tuned/Liftsmith idea): households list for ADMIN_EMAILS. */
export function PlatformAdmin({ email }: { email: string }) {
  const router = useRouter();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    fetch("/api/admin/accounts/")
      .then(async (r) => {
        if (r.status === 404) throw new Error("Platform admin is not configured.");
        if (r.status === 401) {
          window.location.replace("/signin/?next=/admin/");
          return null;
        }
        if (!r.ok) throw new Error("Couldn't load households.");
        return (await r.json()) as Feed;
      })
      .then((body) => {
        if (live && body) setFeed(body);
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : "Couldn't load households.");
      });
    return () => {
      live = false;
    };
  }, []);

  async function signOut() {
    await fetch("/api/auth/signout/", { method: "POST" });
    router.replace("/signin/");
  }

  const households = feed?.households ?? [];
  const paid = households.filter((h) => h.plan === "paid").length;

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line bg-panel/95">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Mark size={36} />
            <div className="min-w-0">
              <h1 className="text-lg font-bold">Everydaypane admin</h1>
              <p className="truncate text-xs text-soft">{email}</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <a className="btn-ghost" href="/household/">
              My household
            </a>
            <button type="button" className="btn-ghost" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 p-4">
        <section className="grid gap-3 sm:grid-cols-3">
          <Tile label="Households" value={feed ? String(households.length) : "…"} />
          <Tile label="Paid" value={feed ? String(paid) : "…"} />
          <Tile label="Displays" value={feed ? String(households.reduce((n, h) => n + h.deviceCount, 0)) : "…"} />
        </section>

        <section className="grid gap-3">
          <h2 className="text-base font-bold">Households</h2>
          {error && (
            <p className="rounded-xl bg-panel p-3 text-sm text-bad" role="alert">
              {error}
            </p>
          )}
          {!error && !feed && <p className="text-sm text-soft">Loading…</p>}
          {feed && households.length === 0 && <p className="text-sm text-soft">No households yet.</p>}
          <ul className="grid gap-2">
            {households.map((h) => (
              <li key={h.id} className="rounded-2xl border border-line bg-panel p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{h.name}</p>
                    <p className="truncate font-mono text-xs text-soft">{h.id}</p>
                  </div>
                  <p className="text-sm font-medium capitalize text-soft">
                    {h.plan === "paid" ? "Household" : "Free"}
                    {h.hasStripe ? " · Stripe" : ""}
                  </p>
                </div>
                <dl className="mt-3 grid gap-1 text-sm text-soft sm:grid-cols-3">
                  <div>
                    <dt className="text-xs uppercase tracking-wide">Created</dt>
                    <dd>{when(h.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide">Displays</dt>
                    <dd>{h.deviceCount}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs uppercase tracking-wide">Members</dt>
                    <dd className="truncate">{h.members.length ? h.members.map((m) => `${m.email} (${m.role})`).join(", ") : "—"}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <p className="text-xs font-semibold tracking-wide text-soft uppercase">{label}</p>
      <p className="mt-1 font-display text-3xl font-extrabold tracking-tight">
        {value}
        {hint ? <span className="ml-2 text-sm font-semibold text-soft">{hint}</span> : null}
      </p>
    </div>
  );
}
