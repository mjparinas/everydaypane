"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";

import { musicFlag } from "@/lib/featureFlags";

import { ConfirmButton, Section } from "./fields";
import { Flagged } from "./flags";
import { loadMusic, useMusic, type ServiceStatus } from "./music";

// Spotify and Sonos without Home Assistant (Melvin, 2026-11-18: "build along side it"). Each account is connected once
// here; music widgets then pick Spotify or a Sonos speaker as their source. Tokens stay on the server.

const RESULTS: Record<string, string> = {
  connected: "is connected. Add a Music widget to a view and pick it as the source.",
  cancelled: "Connecting was cancelled.",
  expired: "That took too long. Try connecting again.",
  failed: "didn't accept the connection. Try again.",
};

const noop = () => () => undefined;
const readResults = () => {
  const q = new URLSearchParams(window.location.search);
  return `${q.get("spotify") ?? ""}|${q.get("sonos") ?? ""}`;
};

function Service({
  name,
  service,
  status,
  result,
  intro,
  envNames,
  onDisconnect,
  children,
}: {
  name: string;
  service: "spotify" | "sonos";
  status: ServiceStatus | undefined;
  result: string;
  intro: string;
  envNames: string;
  onDisconnect: () => void;
  children?: ReactNode;
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
          {name} sign-in isn&rsquo;t set up on the server yet ({envNames} in Vercel). See docs/music.md.
        </p>
      ) : !status.connected ? (
        <>
          <p className="text-sm text-soft">{status.expired ? `${name} stopped accepting the connection. Connect it again.` : intro}</p>
          <a className="btn-primary justify-self-start" href={`/api/music/${service}/connect/`}>
            Connect {name}
          </a>
        </>
      ) : (
        <>
          {status.error && <p className="text-sm text-bad">{status.error}</p>}
          {children}
          <div className="flex flex-wrap gap-2">
            <a className="btn-ghost" href={`/api/music/${service}/connect/`}>
              Use another account
            </a>
            <ConfirmButton label="Disconnect" onConfirm={onDisconnect} />
          </div>
        </>
      )}
    </div>
  );
}

export function MusicPanel() {
  const status = useMusic();
  const [error, setError] = useState("");
  const [spotifyResult = "", sonosResult = ""] = useSyncExternalStore(noop, readResults, () => "|").split("|");

  async function disconnect(service: "spotify" | "sonos") {
    setError("");
    const r = await fetch(`/api/household/music/?service=${service}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) setError("Couldn't disconnect that.");
    await loadMusic(true);
  }

  return (
    <Section title="Music">
      <p className="text-sm text-soft">
        Control Spotify and Sonos straight from the wall, without Home Assistant. Players from Home Assistant&rsquo;s Sonos and Spotify
        integrations keep working too: each Music widget picks where its player comes from.
      </p>
      {error && <p className="text-sm text-bad">{error}</p>}
      <Flagged name={musicFlag("spotify")}>
        <Service
          name="Spotify"
          service="spotify"
          status={status?.spotify}
          result={spotifyResult}
          envNames="SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET"
          intro="Sign in to show what the account is playing on any speaker and move it between Spotify Connect speakers. Play, pause and skip need Spotify Premium."
          onDisconnect={() => void disconnect("spotify")}
        >
          <p className="text-sm text-soft">Connected. Music widgets with Spotify as their source follow whatever this account plays.</p>
        </Service>
      </Flagged>
      <Flagged name={musicFlag("sonos")}>
        <Service
          name="Sonos"
          service="sonos"
          status={status?.sonos}
          result={sonosResult}
          envNames="SONOS_CLIENT_ID and SONOS_CLIENT_SECRET"
          intro="Sign in to your Sonos account to play, pause, skip, set the volume and start your Sonos favourites in any room."
          onDisconnect={() => void disconnect("sonos")}
        >
          <p className="text-sm text-soft">
            {status?.sonos.players.length
              ? `Speakers: ${status.sonos.players.map((p) => p.name).join(", ")}.`
              : "Connected, but Sonos lists no speakers yet."}
          </p>
        </Service>
      </Flagged>
    </Section>
  );
}
