"use client";

import { useEffect, useState } from "react";

import { ConfirmButton, Section, Text, Toggle } from "./fields";
import { useAdmin } from "./store";

// Calendar links (Melvin, 2026-11-17: "can you add support for multiple calendars"): any calendar with an iCal
// address (school, sports, a partner's Google or Outlook calendar) shows on the schedule and month widgets next to
// Google's. The address is checked and stored on the server; this panel keeps only the name, colour and switch.

const COLOURS = ["#16a34a", "#db2777", "#ea580c", "#7c3aed", "#0891b2", "#ca8a04"];
const linkId = () => (Math.random().toString(36).slice(2) + "000000").slice(0, 10);

async function fetchStored(): Promise<Record<string, boolean>> {
  const r = await fetch("/api/household/calendar-links/");
  if (!r.ok) throw new Error(String(r.status));
  return ((await r.json()) as { links: Record<string, boolean> }).links;
}

export function CalendarLinksPanel() {
  const links = useAdmin((s) => s.config.integrations.icals);
  const edit = useAdmin((s) => s.edit);
  const [stored, setStored] = useState<Record<string, boolean>>({});
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    fetchStored().then(
      (s) => live && setStored(s),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNote("");
    setBusy(true);
    const id = linkId();
    try {
      const r = await fetch("/api/household/calendar-links/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, url }),
      });
      const body = (await r.json().catch(() => ({}))) as { error?: string; events?: number; name?: string | null };
      if (!r.ok) return setError(body.error ?? "Couldn't add that calendar.");
      const name = body.name?.trim() || "Calendar";
      edit((c) => {
        const list = c.integrations.icals;
        if (list.length < 20) list.push({ id, name, color: COLOURS[list.length % COLOURS.length] ?? "#16a34a", enabled: true });
      });
      setStored((s) => ({ ...s, [id]: true }));
      setUrl("");
      setNote(`Added “${name}” with ${body.events ?? 0} events around this month. Save to show it on your displays.`);
    } finally {
      setBusy(false);
    }
  }

  function remove(id: string) {
    edit((c) => void (c.integrations.icals = c.integrations.icals.filter((l) => l.id !== id)));
    void fetch(`/api/household/calendar-links/?id=${id}`, { method: "DELETE" });
  }

  function change(id: string, patch: { name?: string; color?: string; enabled?: boolean }) {
    edit((c) => {
      const link = c.integrations.icals.find((l) => l.id === id);
      if (link) Object.assign(link, patch);
    });
  }

  return (
    <Section title="Calendar links">
      <p className="text-sm text-soft">
        Add any calendar that has an iCal address: a school or team calendar, or someone else&rsquo;s Google or Outlook calendar. In Google
        Calendar it&rsquo;s under the calendar&rsquo;s Settings › &ldquo;Secret address in iCal format&rdquo;.
      </p>
      <details className="rounded-xl border border-line p-3 text-sm">
        <summary className="cursor-pointer font-medium">iCloud Calendar</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-soft">
          <li>On a Mac, open Calendar and sign in with the iCloud account.</li>
          <li>Right-click the calendar › Share Calendar… › turn on Public Calendar and copy the link (webcal://…).</li>
          <li>Paste the link below. Everydaypane stores it like any other calendar link.</li>
        </ol>
        <p className="mt-2 text-soft">
          More detail in{" "}
          <a className="text-brand underline-offset-2 hover:underline" href="/docs/icloud-calendar.md">
            docs/icloud-calendar.md
          </a>
          .
        </p>
      </details>
      {links.length > 0 && (
        <div className="grid gap-3">
          {links.map((l) => (
            <div key={l.id} className="grid gap-2 rounded-xl border border-line p-3">
              <div className="flex items-end gap-3">
                <input
                  type="color"
                  aria-label={`Colour for ${l.name}`}
                  className="h-10 w-10 flex-none cursor-pointer rounded-lg border border-line bg-panel p-0.5"
                  value={l.color}
                  onChange={(e) => change(l.id, { color: e.target.value.toLowerCase() })}
                />
                <div className="min-w-0 flex-1">
                  <Text label="Name" value={l.name} maxLength={60} onChange={(v) => change(l.id, { name: v })} />
                </div>
              </div>
              <Toggle label="Show on displays" checked={l.enabled} onChange={(v) => change(l.id, { enabled: v })} />
              {stored[l.id] === false && <p className="text-sm text-bad">This link has lost its address. Remove it and add it again.</p>}
              <ConfirmButton label="Remove" onConfirm={() => remove(l.id)} />
            </div>
          ))}
        </div>
      )}
      <form onSubmit={(e) => void add(e)} className="grid gap-2">
        <Text label="Calendar address" type="url" value={url} onChange={setUrl} placeholder="https://… or webcal://…" />
        <button className="btn-primary justify-self-start" disabled={busy || url.trim().length < 8}>
          {busy ? "Checking…" : "Add calendar"}
        </button>
      </form>
      {note && (
        <p className="text-sm" role="status">
          {note}
        </p>
      )}
      {error && (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      )}
    </Section>
  );
}
