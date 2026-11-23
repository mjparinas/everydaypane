import "server-only";

import { F } from "@/lib/display/mediaFeatures";
import type { HaEntity } from "@/lib/display/types";

import { dropMusicToken, musicToken } from "./musicAuth";

// Spotify's Web API, signed in directly (Melvin, 2026-11-18: alongside Home Assistant). The widget follows whatever
// the connected account is playing, on any speaker, and its sources are the account's Spotify Connect devices, so
// "Play on" moves the music to another room. Reading works on any account; controlling playback needs Premium.

const API = "https://api.spotify.com/v1";

export class SpotifyError extends Error {}

async function spotify(accountId: string, path: string, init: RequestInit = {}): Promise<Response> {
  const send = async () =>
    fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${await musicToken(accountId, "spotify")}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });
  let r = await send();
  if (r.status === 401) {
    // The access token can be cut short on Spotify's side; one fresh try.
    dropMusicToken(accountId, "spotify");
    r = await send();
  }
  if (r.ok) return r;
  const body = (await r.json().catch(() => ({}))) as { error?: { message?: string; reason?: string } };
  if (r.status === 403 && body.error?.reason === "PREMIUM_REQUIRED") throw new SpotifyError("Controlling Spotify needs Premium");
  if (r.status === 404 && body.error?.reason === "NO_ACTIVE_DEVICE") throw new SpotifyError("Spotify isn't playing on any speaker");
  if (r.status === 429) throw new SpotifyError("Spotify asked us to slow down");
  throw new SpotifyError(`Spotify answered ${r.status}`);
}

// ---- Reading ----

interface Image {
  url?: string;
  width?: number | null;
}
interface RawDevice {
  id?: string | null;
  name?: string;
  is_active?: boolean;
  is_restricted?: boolean;
  volume_percent?: number | null;
  supports_volume?: boolean;
}
export interface RawPlayback {
  device?: RawDevice;
  is_playing?: boolean;
  progress_ms?: number | null;
  currently_playing_type?: string;
  item?: {
    name?: string;
    duration_ms?: number;
    artists?: { name?: string }[];
    album?: { name?: string; images?: Image[] };
    // Podcast episodes.
    show?: { name?: string; images?: Image[] };
    images?: Image[];
  } | null;
  actions?: { disallows?: Record<string, boolean | undefined> };
}

const text = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 80) : undefined);

/** The smallest picture at least 300 px wide (a music widget's art is drawn at about that), or the biggest. */
export function pickImage(images: Image[] | undefined): string | undefined {
  const list = (images ?? []).filter((i): i is { url: string; width?: number | null } => typeof i.url === "string");
  const big = list.filter((i) => (i.width ?? 0) >= 300).sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (big[0] ?? list[0])?.url;
}

/** Spotify's player as a media player the music widget knows. `art` is the picture's address; music.ts hashes it. */
export function spotifyPlayer(p: RawPlayback | null, devices: RawDevice[], now: number): { entity: HaEntity; artUrl?: string } {
  const names = devices.map((d) => text(d.name)).filter((n): n is string => Boolean(n));
  const sourceBits = names.length ? F.source : 0;
  if (!p?.device) {
    return { entity: { id: "spotify", state: "idle", name: "Spotify", changed: 0, media: { features: sourceBits, sources: names } } };
  }
  const item = p.item ?? undefined;
  const no = p.actions?.disallows ?? {};
  const artUrl = pickImage(item?.album?.images ?? item?.images ?? item?.show?.images);
  const restricted = p.device.is_restricted === true;
  let features = sourceBits;
  if (!restricted) {
    if (!no.pausing) features |= F.pause;
    if (!no.resuming) features |= F.play;
    if (!no.skipping_next) features |= F.next;
    if (!no.skipping_prev) features |= F.previous;
    if (p.device.supports_volume !== false && typeof p.device.volume_percent === "number") features |= F.volumeSet;
  }
  const artists = (item?.artists ?? []).map((a) => a.name).filter(Boolean);
  return {
    artUrl,
    entity: {
      id: "spotify",
      state: p.is_playing ? "playing" : item ? "paused" : "idle",
      name: text(p.device.name) ?? "Spotify",
      changed: 0,
      media: {
        title: text(item?.name),
        artist: text(artists.join(", ")) ?? text(item?.show?.name),
        album: text(item?.album?.name),
        duration: item?.duration_ms ? item.duration_ms / 1000 : undefined,
        position: typeof p.progress_ms === "number" ? p.progress_ms / 1000 : undefined,
        positionAt: now,
        volume: typeof p.device.volume_percent === "number" ? p.device.volume_percent / 100 : undefined,
        source: text(p.device.name),
        sources: names,
        features,
      },
    },
  };
}

// The speaker list changes rarely and costs a call, so it is kept for a minute.
let deviceMemo: { at: number; devices: RawDevice[] } | null = null;

async function devices(accountId: string, now: number, fresh = false): Promise<RawDevice[]> {
  if (!fresh && deviceMemo && now - deviceMemo.at < 60_000) return deviceMemo.devices;
  const body = (await (await spotify(accountId, "/me/player/devices")).json()) as { devices?: RawDevice[] };
  const list = (body.devices ?? []).filter((d) => d.id && d.name).slice(0, 40);
  deviceMemo = { at: now, devices: list };
  return list;
}

async function playback(accountId: string): Promise<RawPlayback | null> {
  const r = await spotify(accountId, "/me/player?additional_types=episode");
  // 204: nothing is playing anywhere.
  if (r.status === 204) return null;
  return (await r.json().catch(() => null)) as RawPlayback | null;
}

export async function spotifyFeed(
  accountId: string,
  withSources: boolean,
  now = Date.now(),
): Promise<{ entity: HaEntity; artUrl?: string }> {
  const [p, d] = await Promise.all([playback(accountId), withSources ? devices(accountId, now) : Promise.resolve([])]);
  return spotifyPlayer(p, d, now);
}

// ---- Controlling ----

export type MusicAction = "playPause" | "next" | "previous" | "volume" | "mute" | "unmute" | "source";

export async function spotifyAct(accountId: string, action: MusicAction, value?: number, option?: string): Promise<"ok" | "forbidden"> {
  if (action === "playPause") {
    const p = await playback(accountId);
    await spotify(accountId, p?.is_playing ? "/me/player/pause" : "/me/player/play", { method: "PUT" });
  } else if (action === "next") await spotify(accountId, "/me/player/next", { method: "POST" });
  else if (action === "previous") await spotify(accountId, "/me/player/previous", { method: "POST" });
  else if (action === "volume" && value !== undefined && Number.isFinite(value)) {
    const pct = Math.min(100, Math.max(0, Math.round(value)));
    await spotify(accountId, `/me/player/volume?volume_percent=${pct}`, { method: "PUT" });
  } else if (action === "source" && option) {
    // By name, as the widget shows them; only a speaker the account lists.
    const device = (await devices(accountId, Date.now(), true)).find((d) => d.name === option);
    if (!device?.id) return "forbidden";
    await spotify(accountId, "/me/player", { method: "PUT", body: JSON.stringify({ device_ids: [device.id], play: true }) });
  } else return "forbidden";
  return "ok";
}

/** Tests only. */
export function resetSpotifyForTests(): void {
  deviceMemo = null;
}
