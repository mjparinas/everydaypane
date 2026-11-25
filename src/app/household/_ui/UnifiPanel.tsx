"use client";

import { useEffect, useState } from "react";

import { ConfirmButton, Section, Select, Text } from "./fields";

// Settings › UniFi network (docs/unifi.md): saves a UniFi Site Manager API key (checked with UniFi first) and lists
// the sites it can see. The key is never shown again; only whether one is saved.

export interface UnifiStatus {
  connected: boolean;
  sites: { id: string; name: string }[];
  error: string;
}

let pending: Promise<UnifiStatus> | null = null;
const listeners = new Set<(s: UnifiStatus) => void>();

export function loadUnifi(fresh = false): Promise<UnifiStatus> {
  if (!pending || fresh) {
    pending = fetch("/api/household/unifi/")
      .then((r) => (r.ok ? (r.json() as Promise<UnifiStatus>) : Promise.reject(new Error(String(r.status)))))
      .catch(() => ({ connected: false, sites: [], error: "Couldn't ask the server" }));
    void pending.then((s) => listeners.forEach((l) => l(s)));
  }
  return pending;
}

export function useUnifi(): UnifiStatus | null {
  const [status, setStatus] = useState<UnifiStatus | null>(null);
  useEffect(() => {
    let live = true;
    const on = (s: UnifiStatus) => {
      if (live) setStatus(s);
    };
    listeners.add(on);
    void loadUnifi().then(on);
    return () => {
      live = false;
      listeners.delete(on);
    };
  }, []);
  return status;
}

export function UnifiPanel() {
  const status = useUnifi();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(apiKey: string | null) {
    setBusy(true);
    setError("");
    const r = await fetch("/api/household/unifi/", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    }).catch(() => null);
    const body = (await r?.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!r?.ok) {
      setError(body?.error ?? "Couldn't save that.");
      return;
    }
    setKey("");
    await loadUnifi(true);
  }

  return (
    <Section id="settings-unifi" title="UniFi network">
      <p className="text-sm text-soft">
        Internet uptime, latency and outages from your UniFi gateway, read from UniFi&rsquo;s own cloud (Site Manager). Nothing runs at
        home. Make a read-only API key at unifi.ui.com › API; see docs/unifi.md.
      </p>
      {error && <p className="text-sm text-bad">{error}</p>}
      {!status ? (
        <p className="text-sm text-soft">Checking…</p>
      ) : status.connected ? (
        <>
          {status.error ? (
            <p className="text-sm text-bad">{status.error}</p>
          ) : (
            <p className="text-sm" role="status">
              Connected.{" "}
              {status.sites.length
                ? `Sites: ${status.sites.map((s) => s.name).join(", ")}. Add a UniFi network widget to a view.`
                : "The key sees no sites yet."}
            </p>
          )}
          <ConfirmButton label="Remove key" onConfirm={() => void save(null)} />
        </>
      ) : null}
      <Text
        label={status?.connected ? "Replace API key" : "Site Manager API key"}
        type="password"
        value={key}
        maxLength={200}
        hint="Checked with UniFi, then saved encrypted on the server."
        onChange={setKey}
      />
      <button
        type="button"
        className="btn-primary justify-self-start"
        disabled={busy || key.trim().length < 16}
        onClick={() => void save(key.trim())}
      >
        {busy ? "Checking…" : "Save key"}
      </button>
    </Section>
  );
}

/** The site a UniFi network widget shows; empty means the first one the key sees. */
export function UnifiSitePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const status = useUnifi();
  const sites = status?.sites ?? [];
  if (!status?.connected) return null;
  if (sites.length < 2 && !value) return null;
  const options = [{ value: "", label: "First site" }, ...sites.map((s) => ({ value: s.id, label: s.name }))];
  if (value && !sites.some((s) => s.id === value)) options.push({ value, label: "A site this key no longer sees" });
  return <Select label="Site" value={value} options={options} onChange={onChange} />;
}
