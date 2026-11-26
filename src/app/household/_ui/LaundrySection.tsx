"use client";

import { useState } from "react";

import { ConfirmButton, Section, Select, Stepper, Text, Toggle } from "./fields";
import { setLaundryStatus, useLaundry, type LaundryStatus } from "./laundry";
import { useAdmin } from "./store";

// The country of the ThinQ account (LG routes by it). Its API supports many more; these cover the families likely here.
const COUNTRIES = [
  { value: "CA", label: "Canada" },
  { value: "US", label: "United States" },
  { value: "MX", label: "Mexico" },
  { value: "BR", label: "Brazil" },
  { value: "GB", label: "United Kingdom" },
  { value: "IE", label: "Ireland" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "ES", label: "Spain" },
  { value: "IT", label: "Italy" },
  { value: "NL", label: "Netherlands" },
  { value: "AU", label: "Australia" },
  { value: "NZ", label: "New Zealand" },
  { value: "KR", label: "South Korea" },
  { value: "PH", label: "Philippines" },
  { value: "IN", label: "India" },
] as const;

/**
 * Settings › Laundry (2026-11-25): an LG ThinQ personal access token, checked with LG before it is saved, plus the
 * Samsung machines that come with SmartThings (Settings › Smart home). Done notices and how long "done" lasts.
 */
export function LaundrySection() {
  const status = useLaundry();
  const edit = useAdmin((s) => s.edit);
  const laundry = useAdmin((s) => s.config.integrations.smartHome.laundry);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(method: "PUT" | "DELETE") {
    setBusy(true);
    setError("");
    const r = await fetch("/api/household/laundry/", {
      method,
      headers: { "Content-Type": "application/json" },
      ...(method === "PUT" ? { body: JSON.stringify({ token: token.trim(), country: laundry.country }) } : {}),
    }).catch(() => null);
    const body = (await r?.json().catch(() => null)) as (LaundryStatus & { error?: string }) | null;
    setBusy(false);
    if (!r?.ok || !body) return setError(body?.error || "Couldn't save that.");
    setToken("");
    setLaundryStatus(body);
  }

  return (
    <Section id="settings-laundry" title="Laundry (washer and dryer)">
      <p className="text-sm text-soft">
        Time left and &ldquo;done&rdquo; for LG machines through LG ThinQ, and Samsung machines through SmartThings. For LG, make a personal
        access token at connect-pat.lgthinq.com (sign in with your ThinQ account, tick the device permissions) and paste it here; it is
        checked with LG and saved encrypted. Samsung machines appear once SmartThings is connected under Smart home. See docs/laundry.md.
      </p>
      {!status ? (
        <p className="text-sm text-soft">Checking…</p>
      ) : (
        <p className="text-sm" role="status">
          LG ThinQ: {status.lg ? "connected" : "not connected"} · SmartThings: {status.smartthings ? "connected" : "not connected"}
          {status.machines.length
            ? `. Machines: ${status.machines.map((m) => m.name).join(", ")}.`
            : status.lg || status.smartthings
              ? ". No washers or dryers found yet."
              : ""}
          {status.error && <span className="block text-bad">{status.error}</span>}
        </p>
      )}
      <Select
        label="LG account country"
        value={COUNTRIES.some((c) => c.value === laundry.country) ? laundry.country : "CA"}
        options={COUNTRIES}
        hint="Picks LG's servers. Publish to wall after changing it, then connect again."
        onChange={(v) => edit((c) => void (c.integrations.smartHome.laundry.country = v))}
      />
      <Text label="LG personal access token" type="password" value={token} maxLength={400} onChange={setToken} />
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" disabled={busy || token.trim().length < 16} onClick={() => void send("PUT")}>
          {busy ? "Checking…" : status?.lg ? "Replace LG token" : "Connect LG ThinQ"}
        </button>
        {status?.lg && <ConfirmButton label="Disconnect LG" onConfirm={() => void send("DELETE")} />}
      </div>
      <Toggle
        label="Done notice on the alert strip"
        checked={laundry.alertDone}
        hint="A blue strip when a load finishes, tap to dismiss. Needs a Laundry widget on a view and alerts switched on; never emailed."
        onChange={(v) => edit((c) => void (c.integrations.smartHome.laundry.alertDone = v))}
      />
      <Stepper
        label="Show as done for"
        value={laundry.doneMinutes}
        min={15}
        max={720}
        step={15}
        format={(m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`)}
        hint="Unless the next cycle starts first."
        onChange={(v) => edit((c) => void (c.integrations.smartHome.laundry.doneMinutes = v))}
      />
    </Section>
  );
}
