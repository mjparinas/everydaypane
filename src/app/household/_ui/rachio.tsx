"use client";

import { useEffect, useState } from "react";

import { ConfirmButton, Section, Text } from "./fields";

// Rachio sprinklers: whether an API key is saved and its controllers (Settings › Sprinklers and the widget's picker).

export interface RachioStatus {
  configured: boolean;
  controllers: { id: string; name: string }[];
  error: string;
}

let pending: Promise<RachioStatus> | null = null;
const listeners = new Set<(s: RachioStatus) => void>();

function setRachioStatus(s: RachioStatus): void {
  pending = Promise.resolve(s);
  listeners.forEach((l) => l(s));
}

function loadRachio(): Promise<RachioStatus> {
  if (!pending) {
    pending = fetch("/api/household/rachio/")
      .then((r) => (r.ok ? (r.json() as Promise<RachioStatus>) : Promise.reject(new Error(String(r.status)))))
      .catch(() => ({ configured: false, controllers: [], error: "Couldn't ask the server" }));
    void pending.then((s) => listeners.forEach((l) => l(s)));
  }
  return pending;
}

export function useRachio(): RachioStatus | null {
  const [status, setStatus] = useState<RachioStatus | null>(null);
  useEffect(() => {
    let live = true;
    const on = (s: RachioStatus) => {
      if (live) setStatus(s);
    };
    listeners.add(on);
    void loadRachio().then(on);
    return () => {
      live = false;
      listeners.delete(on);
    };
  }, []);
  return status;
}

/** Settings › Sprinklers: the household's Rachio API key, checked with Rachio before it is saved. */
export function SprinklersSection() {
  const status = useRachio();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(method: "PUT" | "DELETE") {
    setBusy(true);
    setError("");
    const r = await fetch("/api/household/rachio/", {
      method,
      headers: { "Content-Type": "application/json" },
      ...(method === "PUT" ? { body: JSON.stringify({ apiKey: key.trim() }) } : {}),
    }).catch(() => null);
    const body = (await r?.json().catch(() => null)) as Partial<RachioStatus> | null;
    setBusy(false);
    if (!r?.ok) return setError(body?.error || "Couldn't save. Try again.");
    setKey("");
    setRachioStatus({ configured: body?.configured ?? false, controllers: body?.controllers ?? [], error: "" });
  }

  return (
    <Section id="settings-sprinklers" title="Sprinklers (Rachio)">
      <p className="text-sm text-soft">
        The next watering from your Rachio controllers, with a Skip button on the wall. Copy your API key from the Rachio app (Profile › API
        key) or app.rach.io (Account settings › Get API key) and paste it here; it is checked with Rachio and saved encrypted. See
        docs/rachio.md.
      </p>
      {!status ? (
        <p className="text-sm text-soft">Checking…</p>
      ) : status.configured ? (
        <>
          {status.error ? (
            <p className="text-sm text-bad">{status.error}</p>
          ) : (
            <p className="text-sm" role="status">
              Connected.{" "}
              {status.controllers.length
                ? `Controllers: ${status.controllers.map((c) => c.name).join(", ")}.`
                : "Rachio lists no controllers for this key yet."}
            </p>
          )}
          <div className="justify-self-start">
            <ConfirmButton label="Disconnect Rachio" onConfirm={() => void send("DELETE")} />
          </div>
        </>
      ) : null}
      <Text label="API key" type="password" value={key} maxLength={100} onChange={setKey} />
      {error && <p className="text-sm text-bad">{error}</p>}
      <button type="button" className="btn-ghost justify-self-start" disabled={busy || !key.trim()} onClick={() => void send("PUT")}>
        {busy ? "Checking…" : status?.configured ? "Replace API key" : "Connect Rachio"}
      </button>
    </Section>
  );
}
