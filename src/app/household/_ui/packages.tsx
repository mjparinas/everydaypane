"use client";

import { useEffect, useState } from "react";

import { ConfirmButton, Section, Text } from "./fields";

// Package tracking: whether a 17TRACK API key is saved and how much tracking quota is left (Settings › Packages and the
// Packages widget's settings).

export interface PackagesStatus {
  configured: boolean;
  remaining?: number;
  total?: number;
  error: string;
}

let pending: Promise<PackagesStatus> | null = null;
const listeners = new Set<(s: PackagesStatus) => void>();

function setStatus(s: PackagesStatus): void {
  pending = Promise.resolve(s);
  listeners.forEach((l) => l(s));
}

function load(): Promise<PackagesStatus> {
  if (!pending) {
    pending = fetch("/api/household/packages/")
      .then((r) => (r.ok ? (r.json() as Promise<PackagesStatus>) : Promise.reject(new Error(String(r.status)))))
      .catch(() => ({ configured: false, error: "Couldn't ask the server" }));
    void pending.then((s) => listeners.forEach((l) => l(s)));
  }
  return pending;
}

export function usePackages(): PackagesStatus | null {
  const [status, set] = useState<PackagesStatus | null>(null);
  useEffect(() => {
    let live = true;
    const on = (s: PackagesStatus) => {
      if (live) set(s);
    };
    listeners.add(on);
    void load().then(on);
    return () => {
      live = false;
      listeners.delete(on);
    };
  }, []);
  return status;
}

/** Settings › Packages: the household's 17TRACK API key, checked with 17TRACK before it is saved. */
export function PackagesSection() {
  const status = usePackages();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(method: "PUT" | "DELETE") {
    setBusy(true);
    setError("");
    const r = await fetch("/api/household/packages/", {
      method,
      headers: { "Content-Type": "application/json" },
      ...(method === "PUT" ? { body: JSON.stringify({ apiKey: key.trim() }) } : {}),
    }).catch(() => null);
    const body = (await r?.json().catch(() => null)) as Partial<PackagesStatus> | null;
    setBusy(false);
    if (!r?.ok) return setError(body?.error || "Couldn't save. Try again.");
    setKey("");
    setStatus({ configured: body?.configured ?? false, remaining: body?.remaining, total: body?.total, error: "" });
  }

  return (
    <Section id="settings-packages" title="Packages (17TRACK)">
      <p className="text-sm text-soft">
        Live status and expected delivery day for the tracking numbers on your Packages widgets, from Canada Post, Purolator, UPS, FedEx,
        DHL, USPS and most other carriers. Make a free account at 17track.net, open the API dashboard (api.17track.net), copy the key under
        Settings › Security and paste it here; it is checked with 17TRACK and saved encrypted. Each new tracking number uses one of the
        key&apos;s quota. See docs/packages.md.
      </p>
      {!status ? (
        <p className="text-sm text-soft">Checking…</p>
      ) : status.configured ? (
        <>
          {status.error ? (
            <p className="text-sm text-bad">{status.error}</p>
          ) : (
            <p className="text-sm" role="status">
              Connected.
              {status.remaining !== undefined
                ? ` ${status.remaining.toLocaleString("en-CA")}${status.total !== undefined ? ` of ${status.total.toLocaleString("en-CA")}` : ""} tracking numbers left on this key.`
                : ""}
            </p>
          )}
          <div className="justify-self-start">
            <ConfirmButton label="Disconnect 17TRACK" onConfirm={() => void send("DELETE")} />
          </div>
        </>
      ) : null}
      <Text label="API Key" type="password" value={key} maxLength={100} onChange={setKey} />
      {error && <p className="text-sm text-bad">{error}</p>}
      <button type="button" className="btn-ghost justify-self-start" disabled={busy || !key.trim()} onClick={() => void send("PUT")}>
        {busy ? "Checking…" : status?.configured ? "Replace API Key" : "Connect 17TRACK"}
      </button>
    </Section>
  );
}
