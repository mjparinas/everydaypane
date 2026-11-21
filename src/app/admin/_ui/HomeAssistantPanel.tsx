"use client";

import { useState } from "react";

import type { DashboardConfig } from "@/lib/config/schema";

import { ConfirmButton, NumberInput, Section, Text } from "./fields";
import { HaEntityList, loadHa, useHa } from "./haEntities";
import { useAdmin } from "./store";

// Home Assistant (Melvin, 2026-11-17): reached through a free Cloudflare Tunnel, locked with Cloudflare Access, so the
// panel takes the address, Home Assistant's long-lived token and the Access service token. The secrets go straight to
// the server and are stored encrypted; this page only ever learns whether each one is set.

export function HomeAssistantPanel() {
  const ha = useAdmin((s) => s.config.integrations.homeAssistant);
  const savedUrl = useAdmin((s) => (JSON.parse(s.saved) as DashboardConfig).integrations.homeAssistant.url);
  const edit = useAdmin((s) => s.edit);
  const status = useHa();
  const [token, setToken] = useState("");
  const [accessId, setAccessId] = useState("");
  const [accessSecret, setAccessSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(body: Record<string, string | null>) {
    setBusy(true);
    setError("");
    const r = await fetch("/api/admin/ha/", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!r?.ok) setError("Couldn't save that.");
    else {
      setToken("");
      setAccessId("");
      setAccessSecret("");
    }
    await loadHa(true);
    setBusy(false);
  }

  const unsaved = ha.url !== savedUrl;
  return (
    <Section title="Home Assistant">
      <p className="text-sm text-soft">
        Lights, switches, thermostats, sensors, UniFi Protect cameras and music (Sonos, Spotify) come through Home Assistant. Our server
        talks to it, never the screens, so it has to be reachable from the internet: a Cloudflare Tunnel with Cloudflare Access in front
        works for free.
      </p>
      <Text
        label="Home Assistant address"
        type="url"
        value={ha.url}
        maxLength={200}
        placeholder="https://ha.getliftsmith.com"
        hint={unsaved ? "Save to use the new address, then test again." : undefined}
        onChange={(v) => edit((c) => void (c.integrations.homeAssistant.url = v.trim()))}
      />

      <div className="grid gap-2 rounded-xl border border-line p-3">
        <h3 className="font-semibold">Access token</h3>
        {status?.tokenSet ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-soft">Saved.</p>
            <ConfirmButton label="Remove" onConfirm={() => void save({ token: null })} />
          </div>
        ) : (
          <>
            <Text
              label="Long-lived access token"
              type="password"
              value={token}
              maxLength={4000}
              hint="In Home Assistant: your profile › Security › Long-lived access tokens › Create token."
              onChange={setToken}
            />
            <button
              type="button"
              className="btn-primary justify-self-start"
              disabled={busy || !token.trim()}
              onClick={() => void save({ token })}
            >
              Save token
            </button>
          </>
        )}
      </div>

      <div className="grid gap-2 rounded-xl border border-line p-3">
        <h3 className="font-semibold">Cloudflare Access service token</h3>
        {status?.accessSet ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-soft">Saved. Requests carry it, so only Everydaypane gets through.</p>
            <ConfirmButton label="Remove" onConfirm={() => void save({ accessId: null, accessSecret: null })} />
          </div>
        ) : (
          <>
            <p className="text-sm text-soft">
              From Cloudflare Zero Trust › Access › Service credentials. Leave these empty if Home Assistant isn&rsquo;t behind Cloudflare
              Access.
            </p>
            <Text label="Client ID" value={accessId} maxLength={200} onChange={setAccessId} />
            <Text label="Client secret" type="password" value={accessSecret} maxLength={400} onChange={setAccessSecret} />
            <button
              type="button"
              className="btn-primary justify-self-start"
              disabled={busy || !accessId.trim() || !accessSecret.trim()}
              onClick={() => void save({ accessId, accessSecret })}
            >
              Save service token
            </button>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-ghost"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void loadHa(true).then(() => setBusy(false));
          }}
        >
          {busy ? "Checking…" : "Test connection"}
        </button>
        <p className={`text-sm ${status?.connected ? "text-good" : "text-soft"}`}>
          {!status
            ? "Checking…"
            : status.connected
              ? `Connected: ${status.entities.length} entities.`
              : (status.error ?? (savedUrl ? "Add the access token." : "Add the address and save."))}
        </p>
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}

      <div className="grid gap-3 border-t border-line pt-4">
        <h3 className="font-semibold">Doorbell pop-up</h3>
        <p className="text-sm text-soft">
          When the doorbell rings, every screen shows its camera full screen. Use the doorbell&rsquo;s ring entity from UniFi Protect (an{" "}
          <span className="font-mono">event.</span> or <span className="font-mono">binary_sensor.</span> entity). Leave empty for no pop-up.
        </p>
        <Text
          label="Doorbell ring entity"
          value={ha.doorbell.entityId}
          maxLength={255}
          placeholder="event.front_door_doorbell"
          list="ha-all"
          onChange={(v) => edit((c) => void (c.integrations.homeAssistant.doorbell.entityId = v.trim()))}
        />
        <HaEntityList id="ha-all" />
        <Text
          label="Camera to show"
          value={ha.doorbell.cameraEntityId}
          maxLength={255}
          placeholder="camera.front_door_high"
          list="ha-cams"
          onChange={(v) => edit((c) => void (c.integrations.homeAssistant.doorbell.cameraEntityId = v.trim()))}
        />
        <HaEntityList id="ha-cams" only="camera." />
        <Text
          label="Live video stream (optional)"
          value={ha.doorbell.stream}
          maxLength={64}
          placeholder="front_door"
          hint="A go2rtc stream (Settings › Live cameras) to play live in the pop-up instead of snapshots."
          onChange={(v) => edit((c) => void (c.integrations.homeAssistant.doorbell.stream = v.trim()))}
        />
        <NumberInput
          label="Show for (seconds)"
          value={ha.doorbell.seconds}
          min={5}
          max={300}
          onChange={(v) => edit((c) => void (c.integrations.homeAssistant.doorbell.seconds = v))}
        />
      </div>
    </Section>
  );
}
