"use client";

import { useEffect, useMemo, useState } from "react";

import type { DashboardConfig } from "@/lib/config/schema";
import { FREE_LIMITS } from "@/lib/plans";

import { ConfirmButton, Section, Select, Text } from "./fields";
import { HouseholdBadge, UpgradeLink, usePlan } from "./plan";
import { useAdmin } from "./store";

// Displays: each screen (kitchen wall panel, an old tablet in the hall) gets its own secret address.
// The address is always shown on the row with Copy on the far right (Melvin, 2026-11-22); "New link" replaces it if
// it leaks, and deleting a display signs that screen out.

interface Device {
  id: string;
  name: string;
  viewId: string | null;
  createdAt: number;
  lastSeenAt: number | null;
  url: string | null;
  editUrl: string | null;
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
  const r = await fetch("/api/household/devices/");
  if (!r.ok) throw new Error(String(r.status));
  return ((await r.json()) as { devices: Device[] }).devices;
}

export function DisplaysPanel() {
  // Only views that have been saved can be assigned: a display reloads the saved document, not this draft.
  const saved = useAdmin((s) => s.saved);
  const { isPaid, openUpgrade } = usePlan();
  const views = useMemo(() => (JSON.parse(saved) as DashboardConfig).views, [saved]);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("Kitchen");
  const [viewId, setViewId] = useState("");
  const [added, setAdded] = useState<{ name: string; url: string; editUrl: string } | null>(null);

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
    if (!isPaid && devices && devices.length >= FREE_LIMITS.displays) {
      openUpgrade("display");
      setError(`Free includes ${FREE_LIMITS.displays} displays. Upgrade to Household for more.`);
      return;
    }
    const r = await call("/api/household/devices/", "POST", { name, viewId: viewId || null });
    const body = (await r.json().catch(() => ({}))) as { url?: string; editUrl?: string; error?: string };
    if (!r.ok || !body.url || !body.editUrl) {
      if (/Household|Free includes/i.test(body.error ?? "")) openUpgrade("display");
      return setError(body.error ?? "Couldn't add the display.");
    }
    setAdded({ name, url: body.url, editUrl: body.editUrl });
    void load();
  }

  async function patch(id: string, p: { name?: string; viewId?: string | null }) {
    setDevices((d) => d?.map((x) => (x.id === id ? { ...x, ...p } : x)) ?? null);
    const r = await call(`/api/household/devices/${id}/`, "PATCH", p);
    if (!r.ok) setError("Couldn't save that change.");
  }

  async function newLink(id: string) {
    setError("");
    const r = await call(`/api/household/devices/${id}/`, "POST");
    const body = (await r.json().catch(() => ({}))) as { url?: string; editUrl?: string };
    if (!body.url || !body.editUrl) return setError("Couldn't get a new address.");
    const { url, editUrl } = body;
    setDevices((d) => d?.map((x) => (x.id === id ? { ...x, url, editUrl } : x)) ?? null);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Add a display">
        {!isPaid && (
          <p className="text-sm text-soft">
            Free includes {FREE_LIMITS.displays} displays
            {devices ? ` · ${devices.length} in use` : ""}. Need more? <UpgradeLink reason="display">See Household</UpgradeLink>
            {devices && devices.length >= FREE_LIMITS.displays ? (
              <>
                {" "}
                <HouseholdBadge className="align-middle" />
              </>
            ) : null}
          </p>
        )}
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
              Open this address on <strong>{added.name}</strong>. It stays visible under Displays.
            </p>
            <Address url={added.url} label="Display" />
            <Address url={added.editUrl} label="Phone edit" />
            <p className="text-xs text-soft">
              On a wall panel or tablet, set the display address as the start page in its browser (kiosk) settings.
            </p>
            <CastHints />
          </div>
        )}
        {error && (
          <div className="grid gap-2" role="alert">
            <p className="text-sm text-bad">{error}</p>
            {!isPaid && /Household|Free includes/i.test(error) ? (
              <button type="button" className="btn-primary justify-self-start" onClick={() => openUpgrade("display")}>
                See Household
              </button>
            ) : null}
          </div>
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
                {d.url ? (
                  <>
                    <Address url={d.url} label="Display" />
                    <CastHints />
                  </>
                ) : (
                  <p className="text-sm text-soft">Address unavailable — give it a new link, or delete and add it again.</p>
                )}
                {d.editUrl && (
                  <div className="grid gap-2 rounded-lg border border-line bg-bg p-3">
                    <Address url={d.editUrl} label="Phone edit" />
                    <div className="flex items-start gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element -- admin SVG from our own route */}
                      <img
                        key={d.editUrl}
                        src={`/api/household/devices/${encodeURIComponent(d.id)}/edit-qr/?v=${encodeURIComponent(d.editUrl)}`}
                        alt={`QR code for editing from ${d.name}`}
                        className="h-28 w-28 rounded-lg bg-white p-1"
                        width={112}
                        height={112}
                      />
                      <p className="text-xs text-soft">
                        Scan to edit meals, shopping and messages with no sign-in. Anyone with this link can change those. Also available as
                        a Phone edit QR widget on the wall.
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <ConfirmButton label="New link" confirm="Tap again: the old address stops working" onConfirm={() => void newLink(d.id)} />
                  <ConfirmButton
                    label="Delete display"
                    confirm="Tap again: this signs the screen out"
                    onConfirm={() => {
                      void call(`/api/household/devices/${d.id}/`, "DELETE").then(() => load());
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/** Address on one row with Copy on the far right (Melvin, 2026-11-22). */
function Address({ url, label }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1">
      {label && <p className="text-xs font-medium text-soft">{label}</p>}
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-bg px-2 py-2 text-xs break-all">{url}</code>
        <button
          type="button"
          className="btn-ghost shrink-0"
          onClick={() => {
            void navigator.clipboard.writeText(url).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/** How to put the castable /d/… URL on a TV or Chromecast (no custom Cast receiver). */
function CastHints() {
  return (
    <div className="grid gap-1 text-xs text-soft">
      <p>
        <strong className="font-medium text-ink">Chromecast / Google TV:</strong> cast a Chrome tab with this address open, or use the
        TV&apos;s browser and set the address as the start page.
      </p>
      <p>
        <strong className="font-medium text-ink">Wall panel / tablet:</strong> set this as the start page in the browser (kiosk) settings.
      </p>
    </div>
  );
}
