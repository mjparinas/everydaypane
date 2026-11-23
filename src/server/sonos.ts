import "server-only";

import { F } from "@/lib/display/mediaFeatures";
import type { HaEntity } from "@/lib/display/types";

import { dropMusicToken, musicToken } from "./musicAuth";
import type { MusicAction } from "./spotify";

// Sonos's cloud Control API, signed in directly (Melvin, 2026-11-18: alongside Home Assistant). A music widget names
// one speaker; Sonos plays and sets volume per group, so the widget controls whatever group that speaker is in right
// now (a speaker grouped with the living room plays and pauses with it). Its sources are the household's Sonos
// favourites.

const API = "https://api.ws.sonos.com/control/api/v1";

export class SonosError extends Error {}

async function sonos(accountId: string, path: string, init: RequestInit = {}): Promise<Response> {
  const send = async () =>
    fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${await musicToken(accountId, "sonos")}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });
  let r = await send();
  if (r.status === 401) {
    dropMusicToken(accountId, "sonos");
    r = await send();
  }
  if (r.ok) return r;
  if (r.status === 429) throw new SonosError("Sonos asked us to slow down");
  // 410: the group changed (speakers were grouped or ungrouped) between reading and tapping.
  if (r.status === 410) throw new SonosError("The speakers were regrouped; try again");
  throw new SonosError(`Sonos answered ${r.status}`);
}

const get = async <T>(accountId: string, path: string): Promise<T> => (await (await sonos(accountId, path)).json()) as T;

// ---- Households, groups and players ----

interface RawGroup {
  id?: string;
  name?: string;
  playbackState?: string;
  playerIds?: string[];
}
interface RawPlayer {
  id?: string;
  name?: string;
}
interface Household {
  id: string;
  groups: RawGroup[];
  players: RawPlayer[];
}

async function households(accountId: string): Promise<Household[]> {
  const list = await get<{ households?: { id?: string }[] }>(accountId, "/households");
  const ids = (list.households ?? [])
    .map((h) => h.id)
    .filter((id): id is string => Boolean(id))
    .slice(0, 5);
  return Promise.all(
    ids.map(async (id) => {
      const g = await get<{ groups?: RawGroup[]; players?: RawPlayer[] }>(accountId, `/households/${encodeURIComponent(id)}/groups`);
      return { id, groups: g.groups ?? [], players: g.players ?? [] };
    }),
  );
}

/** Every speaker, for the admin panel's picker. */
export async function sonosPlayers(accountId: string): Promise<{ id: string; name: string }[]> {
  return (await households(accountId))
    .flatMap((h) => h.players)
    .filter((p): p is { id: string; name: string } => Boolean(p.id && p.name))
    .map((p) => ({ id: p.id, name: p.name.slice(0, 80) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The group a speaker is in now, and its household. */
function findGroup(all: Household[], playerId: string): { household: string; group: RawGroup & { id: string } } | null {
  for (const h of all)
    for (const g of h.groups) if (g.id && g.playerIds?.includes(playerId)) return { household: h.id, group: { ...g, id: g.id } };
  return null;
}

// Favourites change rarely: kept ten minutes per household.
const favMemo = new Map<string, { at: number; items: { id: string; name: string }[] }>();

async function favourites(accountId: string, household: string, now: number): Promise<{ id: string; name: string }[]> {
  const hit = favMemo.get(household);
  if (hit && now - hit.at < 10 * 60_000) return hit.items;
  const body = await get<{ items?: { id?: string; name?: string }[] }>(
    accountId,
    `/households/${encodeURIComponent(household)}/favorites`,
  );
  const items = (body.items ?? [])
    .filter((i): i is { id: string; name: string } => Boolean(i.id && i.name))
    .slice(0, 40)
    .map((i) => ({ id: i.id, name: i.name.slice(0, 80) }));
  favMemo.set(household, { at: now, items });
  return items;
}

// ---- One group as a media player ----

export interface RawPlayback {
  playbackState?: string;
  positionMillis?: number;
  availablePlaybackActions?: { canPlay?: boolean; canPause?: boolean; canSkip?: boolean; canSkipBack?: boolean };
}
export interface RawMetadata {
  container?: { name?: string; imageUrl?: string };
  currentItem?: {
    track?: { name?: string; artist?: { name?: string }; album?: { name?: string }; imageUrl?: string; durationMillis?: number };
  };
  streamInfo?: string;
}
export interface RawVolume {
  volume?: number;
  muted?: boolean;
  fixed?: boolean;
}

const text = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 80) : undefined);

export function sonosPlayer(
  key: string,
  group: { name?: string },
  playback: RawPlayback,
  meta: RawMetadata,
  volume: RawVolume,
  favourites: string[],
  now: number,
): { entity: HaEntity; artUrl?: string } {
  const s = playback.playbackState ?? "";
  const state =
    s === "PLAYBACK_STATE_PLAYING" || s === "PLAYBACK_STATE_BUFFERING" ? "playing" : s === "PLAYBACK_STATE_PAUSED" ? "paused" : "idle";
  const track = meta.currentItem?.track;
  const can = playback.availablePlaybackActions ?? {};
  let features = favourites.length ? F.source : 0;
  if (can.canPlay !== false) features |= F.play;
  if (can.canPause !== false) features |= F.pause;
  if (can.canSkip) features |= F.next;
  if (can.canSkipBack) features |= F.previous;
  if (typeof volume.volume === "number" && !volume.fixed) features |= F.volumeSet | F.mute;
  // Radio has no track name: the station is the title and its "now playing" line the detail.
  const title = text(track?.name) ?? text(meta.container?.name);
  return {
    artUrl: track?.imageUrl ?? meta.container?.imageUrl,
    entity: {
      id: key,
      state,
      name: text(group.name) ?? "Sonos",
      changed: 0,
      media: {
        title,
        artist: text(track?.artist?.name) ?? (track?.name ? undefined : text(meta.streamInfo)),
        album: text(track?.album?.name),
        duration: track?.durationMillis ? track.durationMillis / 1000 : undefined,
        position: typeof playback.positionMillis === "number" ? playback.positionMillis / 1000 : undefined,
        positionAt: now,
        volume: typeof volume.volume === "number" ? volume.volume / 100 : undefined,
        muted: volume.muted,
        sources: favourites,
        features,
      },
    },
  };
}

/** The speakers' players, keyed "sonos:<player id>". A speaker Sonos no longer lists shows as unavailable. */
export async function sonosFeed(
  accountId: string,
  playerIds: string[],
  withSources: Set<string>,
  now = Date.now(),
): Promise<{ key: string; entity: HaEntity; artUrl?: string }[]> {
  if (!playerIds.length) return [];
  const all = await households(accountId);
  return Promise.all(
    playerIds.map(async (playerId) => {
      const key = `sonos:${playerId}`;
      const found = findGroup(all, playerId);
      if (!found) return { key, entity: { id: key, state: "unavailable", name: "Sonos", changed: 0, media: { features: 0 } } };
      const g = encodeURIComponent(found.group.id);
      const [playback, meta, volume, favs] = await Promise.all([
        get<RawPlayback>(accountId, `/groups/${g}/playback`),
        get<RawMetadata>(accountId, `/groups/${g}/playbackMetadata`),
        get<RawVolume>(accountId, `/groups/${g}/groupVolume`),
        withSources.has(playerId) ? favourites(accountId, found.household, now).catch(() => []) : Promise.resolve([]),
      ]);
      return {
        key,
        ...sonosPlayer(
          key,
          found.group,
          playback,
          meta,
          volume,
          favs.map((f) => f.name),
          now,
        ),
      };
    }),
  );
}

export async function sonosAct(
  accountId: string,
  playerId: string,
  action: MusicAction,
  value?: number,
  option?: string,
): Promise<"ok" | "forbidden"> {
  const found = findGroup(await households(accountId), playerId);
  if (!found) return "forbidden";
  const g = `/groups/${encodeURIComponent(found.group.id)}`;
  const post = (path: string, body: unknown = {}) =>
    sonos(accountId, `${g}${path}`, { method: "POST", body: JSON.stringify(body) });
  if (action === "playPause") await post("/playback/togglePlayPause");
  else if (action === "next") await post("/playback/skipToNextTrack");
  else if (action === "previous") await post("/playback/skipToPreviousTrack");
  else if (action === "volume" && value !== undefined && Number.isFinite(value))
    await post("/groupVolume", { volume: Math.min(100, Math.max(0, Math.round(value))) });
  else if (action === "mute" || action === "unmute") await post("/groupVolume/mute", { muted: action === "mute" });
  else if (action === "source" && option) {
    // By name, as the widget shows them; only one of the household's own favourites.
    const fav = (await favourites(accountId, found.household, Date.now())).find((f) => f.name === option);
    if (!fav) return "forbidden";
    await post("/favorites", { favoriteId: fav.id, playOnCompletion: true, action: "REPLACE" });
  } else return "forbidden";
  return "ok";
}

/** Tests only. */
export function resetSonosForTests(): void {
  favMemo.clear();
}
