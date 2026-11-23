"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { ConfirmButton, Section, Toggle } from "./fields";
import { useAdmin } from "./store";

interface Status {
  configured: boolean;
  connected: boolean;
  calendars: { id: string; name: string; color: string; primary: boolean }[];
  expired?: boolean;
  error?: string;
}

async function fetchStatus(): Promise<Status> {
  const r = await fetch("/api/household/microsoft/");
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as Status;
}

const RESULTS: Record<string, string> = {
  connected: "Microsoft 365 is connected. Pick the calendars to show below, then Save.",
  cancelled: "Connecting Microsoft 365 was cancelled.",
  expired: "That took too long. Try connecting again.",
  failed: "Microsoft didn't accept the connection. Try again.",
};

const noop = () => () => undefined;
const readResult = () => new URLSearchParams(window.location.search).get("microsoft") ?? "";

export function MicrosoftPanel() {
  const calendars = useAdmin((s) => s.config.integrations.microsoft.calendars);
  const edit = useAdmin((s) => s.edit);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const result = useSyncExternalStore(noop, readResult, () => "");

  useEffect(() => {
    let live = true;
    fetchStatus().then(
      (s) => live && setStatus(s),
      () => live && setError("Couldn't check Microsoft 365."),
    );
    return () => {
      live = false;
    };
  }, []);

  async function disconnect() {
    const r = await fetch("/api/household/microsoft/", { method: "DELETE" });
    if (!r.ok) return setError("Couldn't disconnect Microsoft 365.");
    setStatus(await fetchStatus().catch(() => null));
  }

  function setCalendar(id: string, change: { enabled?: boolean; color?: string }) {
    const known = status?.calendars.find((c) => c.id === id);
    edit((c) => {
      const list = c.integrations.microsoft.calendars;
      const existing = list.find((x) => x.id === id);
      if (existing) Object.assign(existing, change);
      else if (known && list.length < 50) list.push({ id, name: known.name, color: known.color, enabled: false, ...change });
    });
  }

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
    <Section title="Microsoft 365">
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
          Microsoft sign-in isn&rsquo;t set up on the server yet (MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in Vercel).
        </p>
      ) : !status.connected ? (
        <>
          <p className="text-sm text-soft">
            {status.expired
              ? "Microsoft stopped accepting the connection. Connect it again."
              : "Connect a Microsoft account to show its calendars beside Google and calendar links. Everydaypane can only read them."}
          </p>
          <a className="btn-primary justify-self-start" href="/api/microsoft/connect/">
            Connect Microsoft 365
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
            <a className="btn-ghost" href="/api/microsoft/connect/">
              Use another account
            </a>
            <ConfirmButton label="Disconnect" onConfirm={() => void disconnect()} />
          </div>
        </>
      )}
    </Section>
  );
}
