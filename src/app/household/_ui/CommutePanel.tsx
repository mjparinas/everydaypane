"use client";

import { useEffect, useState } from "react";

import { ConfirmButton, Section, Text } from "./fields";
import { newId, useAdmin } from "./store";
import { TimePicker } from "./TimePicker";

// Commute time (Melvin, 2026-11-19): home and up to six places (work, school), each found from its address with
// TomTom. Only the coordinates and a label are kept; drive times are read by the server (src/server/commute.ts).

export interface Place {
  /** Set by finders that pick something with its own id, such as a tide station. */
  id?: string;
  label: string;
  latitude: number;
  longitude: number;
}

const MAX = 6;

const addressUrl = (address: string) => `/api/household/commute/?${new URLSearchParams({ address })}`;

/** Finds a place by what the admin types, through `url` (TomTom addresses by default), and hands back the one picked. */
export function PlaceFinder({
  label,
  button,
  onPick,
  url = addressUrl,
  placeholder = "Street address or place",
  nothing = "Nothing matched. Try the street address with the city, like \u201c4700 Kingsway, Burnaby\u201d.",
}: {
  label: string;
  button: string;
  onPick: (p: Place) => void;
  url?: (term: string) => string;
  placeholder?: string;
  nothing?: string;
}) {
  const [address, setAddress] = useState("");
  const [matches, setMatches] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function find(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMatches(null);
    const r = await fetch(url(address)).catch(() => null);
    const body = (await r?.json().catch(() => ({}))) as { matches?: Place[]; error?: string } | undefined;
    setBusy(false);
    if (!r?.ok || !body?.matches) return setError(body?.error ?? "Couldn't look up that address.");
    setMatches(body.matches);
  }

  return (
    <div className="grid gap-2">
      <form className="flex items-end gap-2" onSubmit={(e) => void find(e)}>
        <div className="min-w-0 flex-1">
          <Text label={label} value={address} maxLength={120} placeholder={placeholder} onChange={setAddress} />
        </div>
        <button className="btn-primary" disabled={busy || address.trim().length < 3}>
          {busy ? "Finding…" : button}
        </button>
      </form>
      {error && <p className="text-sm text-bad">{error}</p>}
      {matches &&
        (matches.length ? (
          matches.map((m) => (
            <button
              key={m.label}
              type="button"
              className="btn-ghost justify-start text-left"
              onClick={() => {
                onPick(m);
                setMatches(null);
                setAddress("");
              }}
            >
              {m.label}
            </button>
          ))
        ) : (
          <p className="text-sm text-soft">{nothing}</p>
        ))}
    </div>
  );
}

export function CommutePanel() {
  const commute = useAdmin((s) => s.config.integrations.commute);
  const hour12 = useAdmin((s) => s.config.hour12);
  const edit = useAdmin((s) => s.edit);
  const [ready, setReady] = useState<boolean | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    let live = true;
    fetch("/api/household/commute/")
      .then((r) => (r.ok ? (r.json() as Promise<{ ready: boolean }>) : null))
      .then((b) => live && b && setReady(b.ready))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  function change(id: string, patch: { name?: string; emoji?: string; arriveBy?: string }) {
    edit((c) => {
      const d = c.integrations.commute.destinations.find((x) => x.id === id);
      if (d) Object.assign(d, patch);
    });
  }

  return (
    <Section title="Commute">
      <p className="text-sm text-soft">Drive times with live traffic from home to work, school or anywhere else, for the commute widget.</p>
      {ready === false && (
        <p className="text-sm text-bad">
          Add a TomTom key as TOMTOM_API_KEY in Vercel first. It&rsquo;s free; the steps are in docs/commute.md.
        </p>
      )}
      <p className="text-sm">
        {commute.home ? (
          <>
            From <strong>{commute.home.label}</strong>
          </>
        ) : (
          <span className="text-soft">Find your home address first.</span>
        )}
      </p>
      <PlaceFinder
        label={commute.home ? "Another home address" : "Home address"}
        button="Find"
        onPick={(p) => edit((c) => void (c.integrations.commute.home = p))}
      />

      {commute.destinations.length > 0 && (
        <div className="grid gap-3">
          {commute.destinations.map((d) => (
            <div key={d.id} className="grid gap-2 rounded-xl border border-line p-3">
              <p className="text-xs text-soft">{d.label}</p>
              <div className="grid grid-cols-[4rem_1fr] gap-3">
                <Text label="Icon" value={d.emoji} maxLength={8} placeholder="🏢" onChange={(v) => change(d.id, { emoji: v })} />
                <Text label="Name" value={d.name} maxLength={40} onChange={(v) => change(d.id, { name: v })} />
              </div>
              <TimePicker
                label="Be there by"
                value={d.arriveBy}
                hour12={hour12}
                optional
                emptyLabel="No set time"
                hint="Optional. The widget then says when to leave."
                onChange={(v) => change(d.id, { arriveBy: v })}
              />
              <ConfirmButton
                label="Remove"
                onConfirm={() =>
                  edit((c) => void (c.integrations.commute.destinations = c.integrations.commute.destinations.filter((x) => x.id !== d.id)))
                }
              />
            </div>
          ))}
        </div>
      )}

      {commute.destinations.length < MAX ? (
        <div className="grid gap-2 rounded-xl border border-dashed border-line p-3">
          <Text label="New place" value={name} maxLength={40} placeholder="Work, School…" onChange={setName} />
          <PlaceFinder
            label="Its address"
            button="Add"
            onPick={(p) => {
              edit((c) => {
                const list = c.integrations.commute.destinations;
                if (list.length < MAX) list.push({ id: newId("place"), name: name.trim() || "Work", emoji: "", arriveBy: "", ...p });
              });
              setName("");
            }}
          />
        </div>
      ) : (
        <p className="text-xs text-soft">
          Six places is the most, which keeps TomTom&rsquo;s free tier enough for refreshing every five minutes.
        </p>
      )}
      <p className="text-xs text-soft">Save to send the change to your displays.</p>
    </Section>
  );
}
