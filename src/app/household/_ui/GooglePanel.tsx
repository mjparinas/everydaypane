"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { ConfirmButton, Section, Toggle } from "./fields";
import { useAdmin } from "./store";

// Google Calendar (Melvin, 2026-11-17): connect an account once, then pick which of its calendars the schedule and
// month widgets show, and in what colour. The token stays on the server; this panel only learns whether it's set.

interface Status {
  configured: boolean;
  connected: boolean;
  calendars: { id: string; name: string; color: string; primary: boolean }[];
  expired?: boolean;
  error?: string;
}

async function fetchStatus(): Promise<Status> {
  const r = await fetch("/api/household/google/");
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as Status;
}

const RESULTS: Record<string, string> = {
  connected: "Google Calendar is connected. Pick the calendars to show below, then Save.",
  cancelled: "Connecting Google Calendar was cancelled.",
  expired: "That took too long. Try connecting again.",
  failed: "Google didn't accept the connection. Try again.",
};

const noop = () => () => undefined;
const readResult = () => new URLSearchParams(window.location.search).get("google") ?? "";

export function GooglePanel() {
  const calendars = useAdmin((s) => s.config.integrations.google.calendars);
  const edit = useAdmin((s) => s.edit);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const result = useSyncExternalStore(noop, readResult, () => "");

  useEffect(() => {
    let live = true;
    fetchStatus().then(
      (s) => live && setStatus(s),
      () => live && setError("Couldn't check Google Calendar."),
    );
    return () => {
      live = false;
    };
  }, []);

  async function disconnect() {
    const r = await fetch("/api/household/google/", { method: "DELETE" });
    if (!r.ok) return setError("Couldn't disconnect Google Calendar.");
    setStatus(await fetchStatus().catch(() => null));
  }

  function setCalendar(id: string, change: { enabled?: boolean; color?: string }) {
    const known = status?.calendars.find((c) => c.id === id);
    edit((c) => {
      const list = c.integrations.google.calendars;
      const existing = list.find((x) => x.id === id);
      if (existing) Object.assign(existing, change);
      else if (known && list.length < 50) list.push({ id, name: known.name, color: known.color, enabled: false, ...change });
    });
  }

  // Calendars from the account, plus any saved ones the account no longer lists (so they can be switched off).
  const rows = status
    ? [
        ...status.calendars.map((g) => {
          const saved = calendars.find((c) => c.id === g.id);
          return { id: g.id, name: g.name, color: saved?.color ?? g.color, enabled: saved?.enabled ?? false, gone: false };
        }),
        ...calendars.filter((c) => !status.calendars.some((g) => g.id === c.id)).map((c) => ({ ...c, gone: true })),
      ]
    : [];

  return (
    <Section title="Google Calendar">
      {RESULTS[result] && (
        <p className="rounded-xl bg-bg p-3 text-sm" role="status">
          {RESULTS[result]}
        </p>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
      {!status ? (
        !error && <p className="text-sm text-soft">Checking…</p>
      ) : !status.configured ? (
        <p className="text-sm text-soft">
          Google sign-in isn&rsquo;t set up on the server yet (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel).
        </p>
      ) : !status.connected ? (
        <>
          <p className="text-sm text-soft">
            {status.expired
              ? "Google stopped accepting the connection (it was revoked or the password changed). Connect it again."
              : "Connect a Google account to show its calendars on the schedule and month widgets. Everydaypane can only read them."}
          </p>
          <a className="btn-primary justify-self-start" href="/api/google/connect/">
            Connect Google Calendar
          </a>
        </>
      ) : (
        <>
          {status.error && <p className="text-sm text-bad">{status.error}</p>}
          <div className="grid gap-2">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3">
                <input
                  type="color"
                  aria-label={`Colour for ${r.name}`}
                  className="h-9 w-10 flex-none cursor-pointer rounded-lg border border-line bg-panel p-0.5"
                  value={r.color}
                  onChange={(e) => setCalendar(r.id, { color: e.target.value.toLowerCase() })}
                />
                <div className="min-w-0 flex-1">
                  <Toggle
                    label={r.gone ? `${r.name} (no longer in the account)` : r.name}
                    checked={r.enabled}
                    onChange={(v) => setCalendar(r.id, { enabled: v })}
                  />
                </div>
              </div>
            ))}
            {!rows.length && <p className="text-sm text-soft">This account has no calendars.</p>}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <a className="btn-ghost" href="/api/google/connect/">
              Use Another Account
            </a>
            <ConfirmButton label="Disconnect" onConfirm={() => void disconnect()} />
          </div>
        </>
      )}
    </Section>
  );
}
