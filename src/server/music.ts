import "server-only";

import { createHash } from "node:crypto";

import type { DashboardConfig } from "@/lib/config/schema";
import type { HaEntity, MusicData, MusicService } from "@/lib/display/types";

import { musicConnected, MusicDisconnected } from "./musicAuth";
import { fetchPublicHttps, publicHttpsUrl } from "./publicUrl";
import { sonosAct, sonosFeed } from "./sonos";
import { spotifyAct, spotifyFeed, type MusicAction } from "./spotify";

// Spotify and Sonos without Home Assistant (Melvin, 2026-11-18: "build along side it"). Music widgets whose provider
// is Spotify or Sonos share one feed (/api/display/music/), shaped like Home Assistant's media players so the widget
// draws both the same way. As with Home Assistant, only players on a widget are read or controlled, with a fixed set
// of actions, and album art comes through our server (/api/display/art/), never linked.

export const MUSIC_ACTIONS = [
  "playPause",
  "next",
  "previous",
  "volume",
  "mute",
  "unmute",
  "source",
] as const satisfies readonly MusicAction[];

export const PLAYER_KEY = /^(spotify|sonos:[A-Za-z0-9_.:-]{1,100})$/;

/** The direct players widgets show: whether any shows Spotify, the Sonos speakers, and which want their sources. */
export function usedPlayers(config: DashboardConfig): { spotify: boolean; sonos: Set<string>; sources: Set<string> } {
  let spotify = false;
  const sonos = new Set<string>();
  const sources = new Set<string>();
  for (const v of config.views)
    for (const w of v.widgets) {
      if (w.type !== "media") continue;
      if (w.provider === "spotify") {
        spotify = true;
        if (w.showSources) sources.add("spotify");
      } else if (w.provider === "sonos" && w.playerId) {
        sonos.add(w.playerId);
        if (w.showSources) sources.add(w.playerId);
      }
    }
  return { spotify, sonos, sources };
}

const hashOf = (url: string) => createHash("sha256").update(url).digest("hex").slice(0, 16);

/** Only art on a public https address is fetched (a Sonos speaker playing local files names a picture on the LAN). */
export function publicHttps(raw: string | undefined): string | null {
  if (!raw) return null;
  return publicHttpsUrl(raw);
}

// A few seconds of memory so every display polling at once makes one round of calls; art addresses stay server-side.
let memo: { key: string; at: number; data: MusicData; art: Map<string, string> } | null = null;

function describe(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 120) : "No answer";
}

export async function musicFeed(accountId: string, config: DashboardConfig, now = Date.now()): Promise<MusicData> {
  const used = usedPlayers(config);
  const key = `${used.spotify}|${[...used.sonos].sort().join(",")}|${[...used.sources].sort().join(",")}`;
  if (memo && memo.key === key && now - memo.at < 3500) return memo.data;
  const players: Record<string, HaEntity> = {};
  const services: MusicData["services"] = {};
  const art = new Map<string, string>();
  const keep = (k: string, p: { entity: HaEntity; artUrl?: string }) => {
    const url = publicHttps(p.artUrl);
    if (url && p.entity.media) {
      const h = hashOf(url);
      p.entity.media.art = h;
      art.set(`${k}|${h}`, url);
    }
    players[k] = p.entity;
  };
  // One service failing never hides the other.
  const load = async (service: MusicService, read: () => Promise<void>) => {
    if (!(await musicConnected(accountId, service))) return void (services[service] = { connected: false });
    try {
      await read();
      services[service] = { connected: true };
    } catch (error) {
      services[service] = error instanceof MusicDisconnected ? { connected: false } : { connected: true, error: describe(error) };
      // Keep showing the last good state through a bad minute.
      for (const [k, e] of Object.entries(memo?.data.players ?? {})) if (k.startsWith(service) && !players[k]) players[k] = e;
    }
  };
  await Promise.all([
    used.spotify ? load("spotify", async () => keep("spotify", await spotifyFeed(accountId, used.sources.has("spotify"), now))) : null,
    used.sonos.size
      ? load("sonos", async () => {
          for (const p of await sonosFeed(accountId, [...used.sonos], used.sources, now)) keep(p.key, p);
        })
      : null,
  ]);
  const data: MusicData = { updatedAt: now, services, players };
  memo = { key, at: now, data, art: new Map([...(memo?.art ?? []), ...art]) };
  // Bounded: old tracks' addresses are dropped once there are many.
  if (memo.art.size > 200) memo.art = art;
  return data;
}

/** A tap on a display, for a player a widget shows. */
export async function musicAct(
  accountId: string,
  config: DashboardConfig,
  player: string,
  action: MusicAction,
  value?: number,
  option?: string,
): Promise<"ok" | "forbidden"> {
  const used = usedPlayers(config);
  let result: "ok" | "forbidden" = "forbidden";
  if (player === "spotify" && used.spotify) result = await spotifyAct(accountId, action, value, option);
  else if (player.startsWith("sonos:") && used.sonos.has(player.slice(6)))
    result = await sonosAct(accountId, player.slice(6), action, value, option);
  if (result === "ok") memo = null;
  return result;
}

/** A direct player's album art, by the hash the feed gave out. Only addresses the feed itself read. */
export async function musicArt(accountId: string, config: DashboardConfig, player: string, hash: string): Promise<Response | null> {
  if (!PLAYER_KEY.test(player) || !/^[0-9a-f]{16}$/.test(hash)) return null;
  let url = memo?.art.get(`${player}|${hash}`);
  if (!url) {
    // A fresh server instance hasn't read the feed yet.
    await musicFeed(accountId, config);
    url = memo?.art.get(`${player}|${hash}`);
  }
  if (!url) return null;
  let r: Response;
  try {
    r = await fetchPublicHttps(url, { signal: AbortSignal.timeout(10_000) });
  } catch {
    return null;
  }
  const type = r.headers.get("content-type") ?? "";
  // A redirect must land on a public https address too.
  if (r.url && !publicHttps(r.url)) return null;
  if (!r.ok || !type.startsWith("image/") || Number(r.headers.get("content-length") ?? 0) > 5_000_000) return null;
  return new Response(r.body, {
    headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}

/** Tests only. */
export function resetMusicForTests(): void {
  memo = null;
}
