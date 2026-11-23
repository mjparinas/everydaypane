"use client";

import { useState } from "react";

import { Section, Text } from "./fields";
import { useAdmin } from "./store";

// Garbage pickup (Melvin, 2026-11-17): the Township of Langley's collection calendar (Recycle Coach). The home's
// collection zone is found from its address once; the address itself is kept only as a label for this panel.

interface Match {
  address: string;
  zoneId: string;
}

export function GarbagePanel() {
  const garbage = useAdmin((s) => s.config.integrations.garbage);
  const edit = useAdmin((s) => s.edit);
  const [address, setAddress] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [advanced, setAdvanced] = useState(false);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMatches(null);
    const q = new URLSearchParams({ address, projectId: garbage.projectId, districtId: garbage.districtId });
    const r = await fetch(`/api/household/garbage/?${q}`).catch(() => null);
    const body = (await r?.json().catch(() => ({}))) as { matches?: Match[]; error?: string } | undefined;
    setBusy(false);
    if (!r?.ok || !body?.matches) return setError(body?.error ?? "Couldn't search the collection calendar.");
    setMatches(body.matches);
  }

  function pick(m: Match) {
    edit((c) => {
      c.integrations.garbage.zoneId = m.zoneId;
      c.integrations.garbage.zoneLabel = m.address.slice(0, 80);
    });
    setMatches(null);
    setAddress("");
  }

  return (
    <Section title="Garbage pickup">
      <p className="text-sm text-soft">
        {garbage.zoneId ? (
          <>
            Pickup days for <strong className="text-ink">{garbage.zoneLabel || garbage.zoneId}</strong>, from the Township of
            Langley&rsquo;s collection calendar.
          </>
        ) : (
          "Find your address to show your pickup days from the Township of Langley's collection calendar."
        )}
      </p>
      <form className="flex items-end gap-2" onSubmit={(e) => void find(e)}>
        <div className="min-w-0 flex-1">
          <Text label={garbage.zoneId ? "Another address" : "Street address"} value={address} maxLength={120} onChange={setAddress} />
        </div>
        <button className="btn-primary" disabled={busy || address.trim().length < 3}>
          {busy ? "Finding…" : "Find"}
        </button>
      </form>
      {error && <p className="text-sm text-bad">{error}</p>}
      {matches && (
        <div className="grid gap-2">
          {matches.length ? (
            matches.map((m) => (
              <button key={m.zoneId + m.address} type="button" className="btn-ghost justify-start text-left" onClick={() => pick(m)}>
                {m.address}
              </button>
            ))
          ) : (
            <p className="text-sm text-soft">
              No addresses matched. Try just the house number and street, like &ldquo;20338 65 Ave&rdquo;.
            </p>
          )}
        </div>
      )}
      {garbage.zoneId && matches === null && <p className="text-xs text-soft">Save to send the change to your displays.</p>}
      <button type="button" className="justify-self-start text-xs text-soft underline" onClick={() => setAdvanced(!advanced)}>
        {advanced ? "Hide" : "Show"} calendar details
      </button>
      {advanced && (
        <div className="grid grid-cols-3 gap-3">
          <Text
            label="Project"
            value={garbage.projectId}
            maxLength={20}
            onChange={(v) => edit((c) => void (c.integrations.garbage.projectId = v))}
          />
          <Text
            label="District"
            value={garbage.districtId}
            maxLength={20}
            onChange={(v) => edit((c) => void (c.integrations.garbage.districtId = v))}
          />
          <Text
            label="Zone"
            value={garbage.zoneId}
            maxLength={200}
            onChange={(v) => edit((c) => void (c.integrations.garbage.zoneId = v))}
          />
        </div>
      )}
    </Section>
  );
}
