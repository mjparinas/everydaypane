"use client";

import { useState, useSyncExternalStore } from "react";

import type { NativeSmartProvider } from "@/lib/smartHome";

import { ConfirmButton, NumberInput, Section, Text } from "./fields";
import { loadSmartHome, useSmartHome, type SmartServiceStatus } from "./smartHome";
import { useAdmin } from "./store";

const RESULTS: Record<string, string> = {
  connected: "is connected. Add a Home Assistant tile, pick its provider and device.",
  cancelled: "Connecting was cancelled.",
  expired: "That took too long. Try connecting again.",
  failed: "didn't accept the connection. Try again.",
};

const noop = () => () => undefined;
const readResults = () => {
  const q = new URLSearchParams(window.location.search);
  return `${q.get("nest") ?? ""}|${q.get("ecobee") ?? ""}|${q.get("smartthings") ?? ""}`;
};

function ServiceBlock({
  name,
  provider,
  status,
  result,
  envNames,
  docs,
  onDisconnect,
}: {
  name: string;
  provider: NativeSmartProvider;
  status: SmartServiceStatus | undefined;
  result: string;
  envNames: string;
  docs: string;
  onDisconnect: () => void;
}) {
  const said = RESULTS[result];
  return (
    <div className="grid gap-2 rounded-xl border border-line p-3">
      <h3 className="font-semibold">{name}</h3>
      {said && (
        <p className="rounded-xl bg-bg p-3 text-sm" role="status">
          {result === "connected" || result === "failed" ? `${name} ${said}` : said}
        </p>
      )}
      {!status ? (
        <p className="text-sm text-soft">Checking…</p>
      ) : !status.configured ? (
        <p className="text-sm text-soft">
          {name} sign-in isn&rsquo;t set up on the server yet ({envNames}). See {docs}.
        </p>
      ) : !status.connected ? (
        <>
          <p className="text-sm text-soft">
            {status.expired
              ? `${name} stopped accepting the connection. Connect it again.`
              : `Sign in to list ${name} devices on the wall.`}
          </p>
          <a className="btn-primary justify-self-start" href={`/api/smart-home/${provider}/connect/`}>
            Connect {name}
          </a>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <a className="btn-ghost" href={`/api/smart-home/${provider}/connect/`}>
            Use another account
          </a>
          <ConfirmButton label="Disconnect" onConfirm={onDisconnect} />
        </div>
      )}
    </div>
  );
}

/** Govee lights (Melvin, 2026-11-21): an API key from the Govee Home app, checked with Govee before it is kept. */
function GoveeBlock({ status, onChanged }: { status: SmartServiceStatus | undefined; onChanged: () => void }) {
  const [key, setKey] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setNote("");
    const r = await fetch("/api/household/smart-home/", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goveeApiKey: key.trim() }),
    }).catch(() => null);
    const body = ((await r?.json().catch(() => ({}))) ?? {}) as { error?: string; devices?: number };
    setBusy(false);
    if (!r?.ok) return setNote(body.error ?? "Couldn't save that.");
    setKey("");
    setNote(`Saved. Govee lists ${body.devices ?? 0} device${body.devices === 1 ? "" : "s"} on this key.`);
    onChanged();
  }

  async function remove() {
    setNote("");
    const r = await fetch("/api/household/smart-home/?provider=govee", { method: "DELETE" }).catch(() => null);
    if (!r?.ok) setNote("Couldn't remove the key.");
    onChanged();
  }

  return (
    <div className="grid gap-2 rounded-xl border border-line p-3">
      <h3 className="font-semibold">Govee</h3>
      <p className="text-sm text-soft">
        {status?.expired
          ? "Govee stopped accepting the saved key. Paste a new one."
          : status?.connected
            ? "Connected. Add a Smart device widget, pick Govee as its provider and choose a light."
            : "Lights on and off, brightness, colour and scenes. In the Govee Home app: Profile › Settings › Apply for API Key; Govee emails the key. See docs/govee.md."}
      </p>
      {note && (
        <p className="rounded-xl bg-bg p-3 text-sm" role="status">
          {note}
        </p>
      )}
      <Text
        label={status?.connected ? "Replace API key" : "Govee API key"}
        type="password"
        value={key}
        maxLength={80}
        hint="Saved encrypted on the server and never shown again."
        onChange={setKey}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={busy || key.trim().length < 8} onClick={() => void save()}>
          {busy ? "Checking…" : "Save key"}
        </button>
        {status?.connected && <ConfirmButton label="Remove key" onConfirm={() => void remove()} />}
      </div>
    </div>
  );
}

export function SmartHomePanel() {
  const status = useSmartHome();
  const edit = useAdmin((s) => s.edit);
  const smart = useAdmin((s) => s.config.integrations.smartHome);
  const [error, setError] = useState("");
  const [tempestToken, setTempestToken] = useState("");
  const [wuKey, setWuKey] = useState("");
  const [nestR, ecobeeR, stR] = useSyncExternalStore(noop, readResults, () => "||").split("|");

  async function disconnect(provider: NativeSmartProvider) {
    setError("");
    const r = await fetch(`/api/household/smart-home/?provider=${provider}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) setError("Couldn't disconnect that.");
    await loadSmartHome(true);
  }

  async function saveSecret(body: { tempestToken?: string | null; wuApiKey?: string | null }) {
    setError("");
    const r = await fetch("/api/household/smart-home/", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!r?.ok) setError("Couldn't save that.");
    else {
      if (body.tempestToken !== undefined) setTempestToken("");
      if (body.wuApiKey !== undefined) setWuKey("");
    }
  }

  return (
    <>
      <Section id="settings-smart-home" title="Smart home (direct)">
        <p className="text-sm text-soft">
          Control Nest, ecobee, SmartThings and Govee lights on the wall without Home Assistant. Home Assistant tiles keep working; each
          tile picks where its device comes from. Google Nest needs a paid Device Access subscription — see docs/nest.md.
        </p>
        {error && <p className="text-sm text-bad">{error}</p>}
        <ServiceBlock
          name="Nest"
          provider="nest"
          status={status?.nest}
          result={nestR ?? ""}
          envNames="NEST_PROJECT_ID and Google OAuth (or NEST_CLIENT_ID / NEST_CLIENT_SECRET)"
          docs="docs/nest.md"
          onDisconnect={() => void disconnect("nest")}
        />
        <ServiceBlock
          name="ecobee"
          provider="ecobee"
          status={status?.ecobee}
          result={ecobeeR ?? ""}
          envNames="ECOBEE_CLIENT_ID and ECOBEE_CLIENT_SECRET"
          docs="docs/ecobee.md"
          onDisconnect={() => void disconnect("ecobee")}
        />
        <ServiceBlock
          name="SmartThings"
          provider="smartthings"
          status={status?.smartthings}
          result={stR ?? ""}
          envNames="SMARTTHINGS_CLIENT_ID and SMARTTHINGS_CLIENT_SECRET"
          docs="docs/smartthings.md"
          onDisconnect={() => void disconnect("smartthings")}
        />
        <GoveeBlock status={status?.govee} onChanged={() => void loadSmartHome(true)} />
      </Section>

      <Section id="settings-weather-stations" title="Weather stations">
        <p className="text-sm text-soft">Tempest and Weather Underground need Household. Open-Meteo weather is unchanged on Free.</p>
        <NumberInput
          label="Tempest station id"
          value={smart.tempest.stationId ?? 0}
          min={0}
          max={999_999}
          hint="0 clears the station id until you pick one."
          onChange={(v) => edit((c) => void (c.integrations.smartHome.tempest.stationId = v > 0 ? v : undefined))}
        />
        <Text
          label="Tempest API token"
          type="password"
          value={tempestToken}
          maxLength={80}
          hint="From tempestwx.com › Settings › Data Authorizations. Saved encrypted on the server."
          onChange={setTempestToken}
        />
        <button
          type="button"
          className="btn-ghost justify-self-start"
          disabled={!tempestToken.trim()}
          onClick={() => void saveSecret({ tempestToken: tempestToken.trim() })}
        >
          Save Tempest token
        </button>
        <Text
          label="Weather Underground station id"
          value={smart.weatherUnderground.stationId}
          maxLength={24}
          placeholder="ICALANG13"
          onChange={(v) => edit((c) => void (c.integrations.smartHome.weatherUnderground.stationId = v.trim().toUpperCase()))}
        />
        <Text
          label="WU API key (optional)"
          type="password"
          value={wuKey}
          maxLength={80}
          hint="Per-household override; otherwise WU_API_KEY on the server."
          onChange={setWuKey}
        />
        <button
          type="button"
          className="btn-ghost justify-self-start"
          disabled={!wuKey.trim()}
          onClick={() => void saveSecret({ wuApiKey: wuKey.trim() })}
        >
          Save WU key
        </button>
      </Section>

      <Section id="settings-menus" title="School menus">
        <p className="text-sm text-soft">
          Nutrislice district slug and default school name. Example for Langley: slug <code className="text-xs">langleysd35</code>, school
          slug from the district&rsquo;s Nutrislice site. Menus never copy into the meal plan.
        </p>
        <Text
          label="District slug"
          value={smart.menus.slug}
          maxLength={80}
          placeholder="langleysd35"
          onChange={(v) => edit((c) => void (c.integrations.smartHome.menus.slug = v.trim()))}
        />
        <Text
          label="Default school slug"
          value={smart.menus.schoolName}
          maxLength={80}
          onChange={(v) => edit((c) => void (c.integrations.smartHome.menus.schoolName = v.trim()))}
        />
      </Section>
    </>
  );
}
