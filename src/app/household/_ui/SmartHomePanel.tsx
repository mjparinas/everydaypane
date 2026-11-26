"use client";

import { useState, useSyncExternalStore } from "react";

import type { NativeSmartProvider } from "@/lib/smartHome";

import { setAirthingsStatus, useAirthings } from "./airthings";
import { setPoolStatus, usePools } from "./blueRiiot";
import { ConfirmButton, NumberInput, Section, Text, Toggle } from "./fields";
import { LaundrySection } from "./LaundrySection";
import { SprinklersSection } from "./rachio";
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
  return `${q.get("nest") ?? ""}|${q.get("ecobee") ?? ""}|${q.get("smartthings") ?? ""}|${q.get("hue") ?? ""}`;
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

/** LIFX lights (Melvin, 2026-11-25): a personal access token from cloud.lifx.com, checked with LIFX before it is kept. */
function LifxBlock({ status, onChanged }: { status: SmartServiceStatus | undefined; onChanged: () => void }) {
  const [token, setToken] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setNote("");
    const r = await fetch("/api/household/smart-home/", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lifxToken: token.trim() }),
    }).catch(() => null);
    const body = ((await r?.json().catch(() => ({}))) ?? {}) as { error?: string; devices?: number };
    setBusy(false);
    if (!r?.ok) return setNote(body.error ?? "Couldn't save that.");
    setToken("");
    setNote(`Saved. LIFX lists ${body.devices ?? 0} light${body.devices === 1 ? "" : "s"} on this token.`);
    onChanged();
  }

  async function remove() {
    setNote("");
    const r = await fetch("/api/household/smart-home/?provider=lifx", { method: "DELETE" }).catch(() => null);
    if (!r?.ok) setNote("Couldn't remove the token.");
    onChanged();
  }

  return (
    <div className="grid gap-2 rounded-xl border border-line p-3">
      <h3 className="font-semibold">LIFX</h3>
      <p className="text-sm text-soft">
        {status?.expired
          ? "LIFX stopped accepting the saved token. Paste a new one."
          : status?.connected
            ? "Connected. Add a Smart device widget, pick LIFX lights as its provider and choose a light."
            : "Lights on and off, brightness and colour. Sign in at cloud.lifx.com › Settings › Personal access tokens › Generate new token. See docs/lifx.md."}
      </p>
      {note && (
        <p className="rounded-xl bg-bg p-3 text-sm" role="status">
          {note}
        </p>
      )}
      <Text
        label={status?.connected ? "Replace token" : "LIFX token"}
        type="password"
        value={token}
        maxLength={120}
        hint="Saved encrypted on the server and never shown again."
        onChange={setToken}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={busy || token.trim().length < 16} onClick={() => void save()}>
          {busy ? "Checking…" : "Save token"}
        </button>
        {status?.connected && <ConfirmButton label="Remove token" onConfirm={() => void remove()} />}
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
  const [nestR, ecobeeR, stR, hueR] = useSyncExternalStore(noop, readResults, () => "|||").split("|");

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
          Control Nest, ecobee, SmartThings, and Govee, Philips Hue and LIFX lights on the wall without Home Assistant. Home Assistant tiles
          keep working; each tile picks where its device comes from. Google Nest needs a paid Device Access subscription — see docs/nest.md.
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
        <ServiceBlock
          name="Philips Hue"
          provider="hue"
          status={status?.hue}
          result={hueR ?? ""}
          envNames="HUE_CLIENT_ID and HUE_CLIENT_SECRET"
          docs="docs/hue.md"
          onDisconnect={() => void disconnect("hue")}
        />
        <LifxBlock status={status?.lifx} onChanged={() => void loadSmartHome(true)} />
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

      <IndoorAirSection />

      <SprinklersSection />

      <PoolSection />

      <LaundrySection />

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

/** Settings › Indoor air: the household's own Airthings API client, checked against Airthings before it is saved. */
function IndoorAirSection() {
  const status = useAirthings();
  const edit = useAdmin((s) => s.edit);
  const air = useAdmin((s) => s.config.integrations.smartHome.airthings);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(method: "PUT" | "DELETE") {
    setBusy(true);
    setError("");
    const r = await fetch("/api/household/airthings/", {
      method,
      headers: { "Content-Type": "application/json" },
      ...(method === "PUT" ? { body: JSON.stringify({ clientId: clientId.trim(), clientSecret: secret.trim() }) } : {}),
    }).catch(() => null);
    const body = (await r?.json().catch(() => null)) as { error?: string; configured?: boolean; devices?: [] } | null;
    setBusy(false);
    if (!r?.ok) return setError(body?.error || "Couldn't save that.");
    setClientId("");
    setSecret("");
    setAirthingsStatus({ configured: body?.configured ?? false, devices: body?.devices ?? [], error: "" });
  }

  return (
    <Section id="settings-indoor-air" title="Indoor air (Airthings)">
      <p className="text-sm text-soft">
        Radon, CO₂, VOC, particles, humidity and temperature from your Airthings monitors. Make an API client at dashboard.airthings.com ›
        Integrations › API (read-only is enough) and paste it here; it is checked with Airthings and saved encrypted. A Wave only reaches
        the cloud through an Airthings hub or the phone app&rsquo;s Bluetooth sync — see docs/airthings.md.
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
              {status.devices.length
                ? `Devices: ${status.devices.map((d) => d.name).join(", ")}.`
                : "Airthings lists no devices for this client yet."}
            </p>
          )}
          <div className="justify-self-start">
            <ConfirmButton label="Disconnect Airthings" onConfirm={() => void send("DELETE")} />
          </div>
        </>
      ) : null}
      <Text label="Client id" value={clientId} maxLength={100} onChange={setClientId} />
      <Text label="Client secret" type="password" value={secret} maxLength={200} onChange={setSecret} />
      {error && <p className="text-sm text-bad">{error}</p>}
      <button
        type="button"
        className="btn-ghost justify-self-start"
        disabled={busy || !clientId.trim() || !secret.trim()}
        onClick={() => void send("PUT")}
      >
        {busy ? "Checking…" : status?.configured ? "Replace API client" : "Connect Airthings"}
      </button>
      <Toggle
        label="High radon on the alert strip"
        checked={air.alertRadon}
        hint="When a device reads 150 Bq/m³ (4 pCi/L) or more, Airthings' red level."
        onChange={(v) => edit((c) => void (c.integrations.smartHome.airthings.alertRadon = v))}
      />
      <Toggle
        label="High CO₂ on the alert strip"
        checked={air.alertCo2}
        onChange={(v) => edit((c) => void (c.integrations.smartHome.airthings.alertCo2 = v))}
      />
      {air.alertCo2 && (
        <NumberInput
          label="CO₂ alert from (ppm)"
          value={air.co2Ppm}
          min={800}
          max={5000}
          step={100}
          onChange={(v) => edit((c) => void (c.integrations.smartHome.airthings.co2Ppm = v))}
        />
      )}
    </Section>
  );
}

/**
 * Settings › Pool: the Blue Riiot app's own email and password (Blue Riiot has no developer API), checked by signing in
 * before they are saved encrypted.
 */
function PoolSection() {
  const status = usePools();
  const edit = useAdmin((s) => s.edit);
  const pool = useAdmin((s) => s.config.integrations.smartHome.blueRiiot);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(method: "PUT" | "DELETE") {
    setBusy(true);
    setError("");
    const r = await fetch("/api/household/blueriiot/", {
      method,
      headers: { "Content-Type": "application/json" },
      ...(method === "PUT" ? { body: JSON.stringify({ email: email.trim(), password }) } : {}),
    }).catch(() => null);
    const body = (await r?.json().catch(() => null)) as { error?: string; configured?: boolean; pools?: [] } | null;
    setBusy(false);
    if (!r?.ok) return setError(body?.error || "Couldn't save that.");
    setEmail("");
    setPassword("");
    setPoolStatus({ configured: body?.configured ?? false, pools: body?.pools ?? [], error: "" });
  }

  return (
    <Section id="settings-pool" title="Pool (Blue Riiot)">
      <p className="text-sm text-soft">
        Water temperature, pH, ORP and salinity from a Blue Connect. Blue Riiot has no developer API, so this signs in with the email and
        password you use in the Blue Riiot app, the way community integrations do; they are checked with Blue Riiot and saved encrypted.
        It&rsquo;s unofficial, so a change on Blue Riiot&rsquo;s side can break it — see docs/blue-riiot.md.
      </p>
      {!status ? (
        <p className="text-sm text-soft">Checking…</p>
      ) : status.configured ? (
        <>
          {status.error ? (
            <p className="text-sm text-bad">{status.error}</p>
          ) : (
            <p className="text-sm" role="status">
              Connected. {status.pools.length ? `Pools: ${status.pools.map((p) => p.name).join(", ")}.` : "Blue Riiot lists no pools yet."}
            </p>
          )}
          <div className="justify-self-start">
            <ConfirmButton label="Disconnect Blue Riiot" onConfirm={() => void send("DELETE")} />
          </div>
        </>
      ) : null}
      <Text label="Blue Riiot email" value={email} maxLength={200} onChange={setEmail} />
      <Text label="Blue Riiot password" type="password" value={password} maxLength={200} onChange={setPassword} />
      {error && <p className="text-sm text-bad">{error}</p>}
      <button
        type="button"
        className="btn-ghost justify-self-start"
        disabled={busy || !email.trim() || !password}
        onClick={() => void send("PUT")}
      >
        {busy ? "Checking…" : status?.configured ? "Replace sign-in" : "Connect Blue Riiot"}
      </button>
      <Toggle
        label="Pool water out of range on the alert strip"
        checked={pool.alerts}
        hint="pH, ORP, free chlorine or salinity past Blue Riiot's warning range, from a reading in the last six hours."
        onChange={(v) => edit((c) => void (c.integrations.smartHome.blueRiiot.alerts = v))}
      />
    </Section>
  );
}
