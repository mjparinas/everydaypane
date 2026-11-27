"use client";

import { useEffect, useMemo, useState } from "react";

import { DisplaysSkeleton } from "@/components/Skeleton";
import type { DashboardConfig } from "@/lib/config/schema";
import { FREE_LIMITS } from "@/lib/plans";
import { DISPLAY_PATH } from "@/lib/site";

import { ConfirmButton, Section, Select, Text } from "./fields";
import { HouseholdBadge, UpgradeLink, usePlan } from "./plan";
import { useAdmin } from "./store";

// Displays: each screen (kitchen wall panel, an old tablet in the hall) is named here; the wall opens the shared
// `/display/` gate and unlocks with a phone QR (or a signed-in picker). "New link" rotates the device token so an
// already-unlocked browser stops working once its cookie no longer matches (Melvin, 2026-11-23).

interface Device {
  id: string;
  name: string;
  viewId: string | null;
  createdAt: number;
  lastSeenAt: number | null;
  url: string | null;
  editUrl: string | null;
}

export function seen(at: number | null, now = Date.now()): string {
  if (at === null) return "Never opened";
  const ms = now - at;
  // `last_seen_at` writes at most once every 5 minutes (`LAST_SEEN_THROTTLE_MS`), plus 1 minute of poll headroom.
  if (ms < 360_000) return "Online";
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

  const viewOptions = [{ value: "", label: "Follow the Schedule" }, ...views.map((v) => ({ value: v.id, label: v.name }))];

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
      <Section title="Add a Display">
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
            Add Display
          </button>
        </form>
        {added && <GetKitchenOnline name={added.name} wallUrl={added.url} editUrl={added.editUrl} />}
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
          <DisplaysSkeleton />
        ) : devices.length === 0 ? (
          <div className="grid gap-2 text-sm text-soft">
            <p className="font-medium text-ink">First screen</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Name it (Kitchen works) and tap Add display.</li>
              <li>
                Open <code className="text-xs">{DISPLAY_PATH}</code> on the tablet or wall panel, then unlock with your phone.
              </li>
              <li>
                Optional: open{" "}
                <a href="#views" className="font-semibold text-brand hover:underline">
                  Views
                </a>{" "}
                and start from a Free template.
              </li>
            </ol>
            <p className="text-xs">Free includes two displays. Upgrade from Settings › Plan when you need more.</p>
          </div>
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
                  <DisplaySetupDetails
                    deviceId={d.id}
                    wallUrl={d.url}
                    editUrl={d.editUrl}
                    onNewLink={() => void newLink(d.id)}
                    onDelete={() => {
                      void call(`/api/household/devices/${d.id}/`, "DELETE").then(() => load());
                    }}
                  />
                ) : (
                  <p className="text-sm text-soft">Address unavailable — give it a new link, or delete and add it again.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/** First-run path after Add: get the wall online, then optional phone-edit / cast (H3, 2026-11-24). */
function GetKitchenOnline({ name, wallUrl, editUrl }: { name: string; wallUrl: string; editUrl: string }) {
  const [more, setMore] = useState(false);
  return (
    <div className="grid gap-3 rounded-xl border border-brand p-3" role="status">
      <p className="text-sm font-semibold text-ink">Get {name} online</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>
          Open this wall address on the kitchen panel (or cast a browser tab to it):
          <div className="mt-1">
            <Address url={wallUrl} />
          </div>
        </li>
        <li>Unlock with your phone — scan the QR on the wall, or sign in and pick this display.</li>
      </ol>
      <button type="button" className="btn-ghost justify-self-start text-sm" aria-expanded={more} onClick={() => setMore((v) => !v)}>
        {more ? "Hide Phone Edit & Casting" : "Phone Edit & Casting Tips"}
      </button>
      {more ? (
        <div className="grid gap-2 border-t border-line pt-2">
          <Address url={editUrl} label="Phone Edit (Meals, Shopping, Messages — No Sign-In)" />
          <p className="text-xs text-soft">Anyone with the phone-edit link can change those lists. Keep the QR on the wall, not online.</p>
          <CastHints />
        </div>
      ) : null}
    </div>
  );
}

function DisplaySetupDetails({
  deviceId,
  wallUrl,
  editUrl,
  onNewLink,
  onDelete,
}: {
  deviceId: string;
  wallUrl: string;
  editUrl: string | null;
  onNewLink: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-2">
      <Address url={wallUrl} label="Wall Address" />
      <button type="button" className="btn-ghost justify-self-start text-sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? "Hide Setup Extras" : "Phone Edit, QR & Casting"}
      </button>
      {open ? (
        <div className="grid gap-2 rounded-lg border border-line bg-bg p-3">
          <CastHints />
          {editUrl ? (
            <>
              <Address url={editUrl} label="Phone Edit" />
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- admin SVG from our own route */}
                <img
                  key={editUrl}
                  src={`/api/household/devices/${encodeURIComponent(deviceId)}/edit-qr/?v=${encodeURIComponent(editUrl)}`}
                  alt="QR code for phone edit"
                  className="h-28 w-28 rounded-lg bg-white p-1"
                  width={112}
                  height={112}
                />
                <p className="text-xs text-soft">
                  Scan to edit meals, shopping and messages with no sign-in. Anyone with this link can change those. Also available as a
                  Phone edit QR widget on the wall.
                </p>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <ConfirmButton
          label="New Link"
          confirm="Tap again: signs this display out and refreshes the phone-edit address"
          onConfirm={onNewLink}
        />
        <ConfirmButton label="Delete Display" confirm="Tap again: this signs the screen out" onConfirm={onDelete} />
      </div>
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

/** How to put the wall gate on a TV or Chromecast (no custom Cast receiver). */
function CastHints() {
  return (
    <div className="grid gap-1 text-xs text-soft">
      <p>
        <strong className="font-medium text-ink">Chromecast / Google TV:</strong> cast a Chrome tab with{" "}
        <code className="text-xs">{DISPLAY_PATH}</code> open, or use the TV&apos;s browser and unlock with your phone (QR).
      </p>
      <p>
        <strong className="font-medium text-ink">Wall panel / tablet:</strong> set <code className="text-xs">{DISPLAY_PATH}</code> as the
        start page, then unlock once with your phone.
      </p>
    </div>
  );
}
