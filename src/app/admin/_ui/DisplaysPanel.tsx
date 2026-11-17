"use client";

import { useEffect, useState } from "react";

import { ConfirmButton, Section, Select, Text } from "./fields";
import { useAdmin } from "./store";

// Displays: each screen (the UC-Display21 in the kitchen, an old tablet in the hall) gets its own secret address.
// The address is shown once, when it's added; deleting a display signs that screen out.

interface Device {
  id: string;
  name: string;
  viewId: string | null;
  createdAt: number;
  lastSeenAt: number | null;
}

function seen(at: number | null): string {
  if (at === null) return "Never opened";
  const min = Math.round((Date.now() - at) / 60_000);
  if (min < 2) return "Online";
  if (min < 60) return `Seen ${min} min ago`;
  if (min < 48 * 60) return `Seen ${Math.round(min / 60)} h ago`;
  return `Seen ${new Date(at).toLocaleDateString("en-CA")}`;
}

async function call(url: string, method: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function fetchDevices(): Promise<Device[]> {
  const r = await fetch("/api/admin/devices/");
  if (!r.ok) throw new Error(String(r.status));
  return ((await r.json()) as { devices: Device[] }).devices;
}

export function DisplaysPanel() {
  const views = useAdmin((s) => s.config.views);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("Kitchen");
  const [viewId, setViewId] = useState("");
  const [added, setAdded] = useState<{ name: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function load() {
    return fetchDevices().then(
      (d) => setDevices(d),
      () => setError("Couldn't load the displays."),
    );
  }
  useEffect(() => {
    let live = true;
    fetchDevices().then(
      (d) => live && setDevices(d),
      () => live && setError("Couldn't load the displays."),
    );
    return () => {
      live = false;
    };
  }, []);

  const viewOptions = [{ value: "", label: "Follow the schedule" }, ...views.map((v) => ({ value: v.id, label: v.name }))];

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const r = await call("/api/admin/devices/", "POST", { name, viewId: viewId || null });
    const body = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!r.ok || !body.url) return setError(body.error ?? "Couldn't add the display.");
    setAdded({ name, url: body.url });
    setCopied(false);
    void load();
  }

  async function patch(id: string, p: { name?: string; viewId?: string | null }) {
    setDevices((d) => d?.map((x) => (x.id === id ? { ...x, ...p } : x)) ?? null);
    const r = await call(`/api/admin/devices/${id}/`, "PATCH", p);
    if (!r.ok) setError("Couldn't save that change.");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Add a display">
        <form onSubmit={add} className="grid gap-3">
          <Text label="Name" value={name} maxLength={40} onChange={setName} placeholder="Kitchen" />
          <Select label="Shows" value={viewId} options={viewOptions} onChange={setViewId} />
          <button className="btn-primary" disabled={!name.trim()}>
            Add display
          </button>
        </form>
        {added && (
          <div className="grid gap-2 rounded-xl border border-brand p-3" role="status">
            <p className="text-sm">
              Open this address on <strong>{added.name}</strong>. It is shown only now, so copy it before you leave this page.
            </p>
            <code className="block overflow-x-auto rounded-lg bg-bg p-2 text-xs break-all">{added.url}</code>
            <div className="flex gap-2">
              <button
                className="btn-ghost"
                onClick={() => {
                  void navigator.clipboard.writeText(added.url).then(() => setCopied(true));
                }}
              >
                {copied ? "Copied" : "Copy address"}
              </button>
              <a className="btn-ghost" href={added.url} target="_blank" rel="noreferrer">
                Open ↗
              </a>
            </div>
            <p className="text-xs text-soft">On the UC-Display21, set this as the start page in its browser (kiosk) settings.</p>
          </div>
        )}
        {error && (
          <p className="text-sm text-bad" role="alert">
            {error}
          </p>
        )}
      </Section>

      <Section title="Displays">
        {devices === null ? (
          <p className="text-sm text-soft">Loading…</p>
        ) : devices.length === 0 ? (
          <p className="text-sm text-soft">No displays yet. Add one to get its address.</p>
        ) : (
          <ul className="grid gap-3">
            {devices.map((d) => (
              <li key={d.id} className="grid gap-2 rounded-xl border border-line p-3">
                <div className="flex items-center justify-between gap-2 text-xs text-soft">
                  <span>{seen(d.lastSeenAt)}</span>
                  <span>Added {new Date(d.createdAt).toLocaleDateString("en-CA")}</span>
                </div>
                <Text label="Name" value={d.name} maxLength={40} onChange={(v) => v.trim() && void patch(d.id, { name: v })} />
                <Select
                  label="Shows"
                  value={d.viewId ?? ""}
                  options={viewOptions}
                  onChange={(v) => void patch(d.id, { viewId: v || null })}
                />
                <ConfirmButton
                  label="Delete display"
                  confirm="Tap again: this signs the screen out"
                  onConfirm={() => {
                    void call(`/api/admin/devices/${d.id}/`, "DELETE").then(() => load());
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
