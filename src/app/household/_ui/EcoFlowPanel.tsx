"use client";

import { useEffect, useState } from "react";

import { ConfirmButton, Section, Text } from "./fields";

// Settings › EcoFlow (Melvin, 2026-11-21): the household's own key pair from developer.ecoflow.com, saved encrypted on
// the server, and the devices those keys can see. Widgets pick devices from this list.

export interface EcoFlowListedDevice {
  sn: string;
  name: string;
  product: string;
  online: boolean;
}

export interface EcoFlowStatus {
  connected: boolean;
  devices: EcoFlowListedDevice[];
  error: string;
}

let pending: Promise<EcoFlowStatus> | null = null;
const listeners = new Set<(s: EcoFlowStatus) => void>();

export function loadEcoFlow(fresh = false): Promise<EcoFlowStatus> {
  if (!pending || fresh) {
    pending = fetch("/api/household/ecoflow/")
      .then((r) => (r.ok ? (r.json() as Promise<EcoFlowStatus>) : Promise.reject(new Error(String(r.status)))))
      .catch(() => ({ connected: false, devices: [], error: "Couldn't ask the server." }));
    void pending.then((s) => listeners.forEach((l) => l(s)));
  }
  return pending;
}

export function useEcoFlow(): EcoFlowStatus | null {
  const [status, setStatus] = useState<EcoFlowStatus | null>(null);
  useEffect(() => {
    let live = true;
    const on = (s: EcoFlowStatus) => {
      if (live) setStatus(s);
    };
    listeners.add(on);
    void loadEcoFlow().then(on);
    return () => {
      live = false;
      listeners.delete(on);
    };
  }, []);
  return status;
}

export function EcoFlowPanel() {
  const status = useEcoFlow();
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    const r = await fetch("/api/household/ecoflow/", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessKey: accessKey.trim(), secretKey: secretKey.trim() }),
    }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setError("Couldn't save those keys.");
    setAccessKey("");
    setSecretKey("");
    await loadEcoFlow(true);
  }

  async function disconnect() {
    setError("");
    const r = await fetch("/api/household/ecoflow/", { method: "DELETE" }).catch(() => null);
    if (!r?.ok) setError("Couldn't remove the keys.");
    await loadEcoFlow(true);
  }

  return (
    <Section id="settings-ecoflow" title="EcoFlow">
      <p className="text-sm text-soft">
        Battery level, solar and power in and out from your EcoFlow power stations, straight from EcoFlow (no Home Assistant). Make an
        access key and secret key at developer.ecoflow.com with the same account as the EcoFlow app. See docs/ecoflow.md.
      </p>
      {error && <p className="text-sm text-bad">{error}</p>}
      {!status ? (
        <p className="text-sm text-soft">Checking…</p>
      ) : status.connected ? (
        <>
          {status.error ? (
            <p className="text-sm text-bad" role="status">
              {status.error}. Check the keys, or paste them again.
            </p>
          ) : status.devices.length === 0 ? (
            <p className="text-sm text-soft">The keys work, but EcoFlow lists no devices on that account yet.</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {status.devices.map((d) => (
                <li key={d.sn} className="flex flex-wrap justify-between gap-2 rounded-xl bg-bg px-3 py-2">
                  <span className="font-medium">{d.name}</span>
                  <span className="text-soft">
                    {d.product ? `${d.product} · ` : ""}
                    {d.online ? "Online" : "Offline"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" onClick={() => void loadEcoFlow(true)}>
              Check again
            </button>
            <ConfirmButton label="Remove keys" onConfirm={() => void disconnect()} />
          </div>
        </>
      ) : null}
      <Text label="Access key" type="password" value={accessKey} maxLength={128} onChange={setAccessKey} />
      <Text
        label="Secret key"
        type="password"
        value={secretKey}
        maxLength={128}
        hint="Saved encrypted on the server and never shown again."
        onChange={setSecretKey}
      />
      <button
        type="button"
        className="btn-primary justify-self-start"
        disabled={busy || accessKey.trim().length < 8 || secretKey.trim().length < 8}
        onClick={() => void save()}
      >
        {status?.connected ? "Replace keys" : "Save keys"}
      </button>
    </Section>
  );
}
