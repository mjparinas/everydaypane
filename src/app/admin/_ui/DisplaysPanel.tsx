"use client";

import { useEffect, useState } from "react";

import { ConfirmButton, Section, Select, Text } from "./fields";
import { useAdmin } from "./store";

// Displays: each screen (the UC-Display21 in the kitchen, an old tablet in the hall) gets its own secret address.
// Its address can be shown and copied again any time (Melvin, 2026-11-17); "New link" replaces it if it leaks, and
// deleting a display signs that screen out.

interface Device {
  id: string;
  name: string;
  viewId: string | null;
  createdAt: number;
  lastSeenAt: number | null;
}

function seen(at: number | null): string {
  if (at === null) return "Never opened";
  const ms = Date.now() - at;
  if (ms < 120_000) return "Online";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return min <= 1 ? "Seen 1 min ago" : `Seen ${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr === 1 ? "Seen 1 h ago" : `Seen ${hr} h ago`;
  if (hr < 48) return "Seen yesterday";
  return `Seen ${new Date(at).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}`;
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
              Open this address on <strong>{added.name}</strong>. You can see it again any time under Displays.
            </p>
            <Address url={added.url} />
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
                <DeviceLink id={d.id} />
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

/** A display's address with copy and open buttons. */
function Address({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <code className="block overflow-x-auto rounded-lg bg-bg p-2 text-xs break-all">{url}</code>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            void navigator.clipboard.writeText(url).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy address"}
        </button>
        <a className="btn-ghost" href={url} target="_blank" rel="noreferrer">
          Open ↗
        </a>
      </div>
    </>
  );
}

/** Shows a display's address on request, and gives it a new one (the old address stops working). */
function DeviceLink({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function fetchLink(method: "GET" | "POST") {
    setError("");
    const r = await call(`/api/admin/devices/${id}/`, method);
    const body = (await r.json().catch(() => ({}))) as { url?: string };
    if (body.url) return setUrl(body.url);
    // Displays added before addresses were kept can only get a new one.
    setError(
      r.status === 404 && method === "GET"
        ? "This display was added before addresses were kept. Give it a new link."
        : "Couldn't get the address.",
    );
  }

  return (
    <div className="grid gap-2">
      {url ? (
        <Address url={url} />
      ) : (
        <button type="button" className="btn-ghost justify-self-start" onClick={() => void fetchLink("GET")}>
          Show address
        </button>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
      <ConfirmButton label="New link" confirm="Tap again: the old address stops working" onConfirm={() => void fetchLink("POST")} />
    </div>
  );
}
