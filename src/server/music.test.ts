import { afterEach, describe, expect, it, vi } from "vitest";

import { DELETE as adminDELETE, GET as adminGET } from "@/app/api/admin/music/route";
import { GET as artGET } from "@/app/api/display/art/route";
import { GET as musicGET, POST as musicPOST } from "@/app/api/display/music/route";
import { GET as callbackGET } from "@/app/api/music/spotify/callback/route";
import { GET as connectGET } from "@/app/api/music/spotify/connect/route";
import { configSchema, type DashboardConfig } from "@/lib/config/schema";
import { F } from "@/lib/display/mediaFeatures";
import type { MusicData } from "@/lib/display/types";
import { cookieFor, req, useTestServer } from "@/test/server";

import { loadConfig, saveConfig } from "./config";
import { addDevice } from "./devices";
import { publicHttps, resetMusicForTests, usedPlayers } from "./music";
import { resetMusicAuthForTests } from "./musicAuth";
import { getSecret, setSecret } from "./secrets";
import { resetSonosForTests, sonosPlayer } from "./sonos";
import { pickImage, resetSpotifyForTests, spotifyPlayer } from "./spotify";

vi.mock("node:dns/promises", () => ({
  lookup: () => Promise.resolve([{ address: "1.1.1.1", family: 4 }]),
}));

const NOW = Date.parse("2026-11-18T19:00:00Z");

const playing = {
  device: { id: "dev-kitchen", name: "Kitchen", volume_percent: 40, supports_volume: true },
  is_playing: true,
  progress_ms: 61_000,
  item: {
    name: "Here Comes the Sun",
    duration_ms: 185_000,
    artists: [{ name: "The Beatles" }],
    album: {
      name: "Abbey Road",
      images: [
        { url: "https://i.scdn.co/image/640", width: 640 },
        { url: "https://i.scdn.co/image/300", width: 300 },
        { url: "https://i.scdn.co/image/64", width: 64 },
      ],
    },
  },
  actions: { disallows: { resuming: true } },
};

describe("Spotify's player", () => {
  it("reads what's playing, where, and what can be done", () => {
    const { entity, artUrl } = spotifyPlayer(
      playing,
      [
        { id: "dev-kitchen", name: "Kitchen" },
        { id: "dev-car", name: "Car" },
      ],
      NOW,
    );
    expect(artUrl).toBe("https://i.scdn.co/image/300");
    expect(entity).toMatchObject({ id: "spotify", state: "playing", name: "Kitchen" });
    expect(entity.media).toMatchObject({
      title: "Here Comes the Sun",
      artist: "The Beatles",
      album: "Abbey Road",
      duration: 185,
      position: 61,
      positionAt: NOW,
      volume: 0.4,
      source: "Kitchen",
      sources: ["Kitchen", "Car"],
    });
    const f = entity.media?.features ?? 0;
    expect(f & F.pause).toBeTruthy();
    expect(f & F.play).toBe(0);
    expect(f & F.next && f & F.previous && f & F.volumeSet && f & F.source).toBeTruthy();
    expect(f & F.mute).toBe(0);
  });

  it("offers the speakers to start on when nothing is playing", () => {
    const { entity } = spotifyPlayer(null, [{ id: "dev-car", name: "Car" }], NOW);
    expect(entity).toMatchObject({ state: "idle", media: { features: F.source, sources: ["Car"] } });
  });

  it("picks art about the size the widget draws", () => {
    expect(pickImage([{ url: "https://a/64", width: 64 }])).toBe("https://a/64");
    expect(pickImage(undefined)).toBeUndefined();
  });
});

describe("A Sonos group", () => {
  it("reads the track, the group's volume and its favourites", () => {
    const { entity, artUrl } = sonosPlayer(
      "sonos:RINCON_A",
      { name: "Kitchen + 1" },
      {
        playbackState: "PLAYBACK_STATE_PAUSED",
        positionMillis: 5000,
        availablePlaybackActions: { canPlay: true, canPause: true, canSkip: true, canSkipBack: false },
      },
      {
        currentItem: { track: { name: "Song", artist: { name: "Band" }, imageUrl: "https://art.example/a.jpg", durationMillis: 200_000 } },
      },
      { volume: 25, muted: false, fixed: false },
      ["Morning mix"],
      NOW,
    );
    expect(artUrl).toBe("https://art.example/a.jpg");
    expect(entity).toMatchObject({ id: "sonos:RINCON_A", state: "paused", name: "Kitchen + 1" });
    expect(entity.media).toMatchObject({
      title: "Song",
      artist: "Band",
      duration: 200,
      position: 5,
      volume: 0.25,
      sources: ["Morning mix"],
    });
    const f = entity.media?.features ?? 0;
    expect(f & F.next && f & F.mute && f & F.volumeSet && f & F.source).toBeTruthy();
    expect(f & F.previous).toBe(0);
  });

  it("shows a radio station by its name, and no volume on a fixed-volume speaker", () => {
    const { entity } = sonosPlayer(
      "sonos:RINCON_A",
      {},
      { playbackState: "PLAYBACK_STATE_PLAYING" },
      { container: { name: "CBC Radio One" }, streamInfo: "The Current" },
      { volume: 50, fixed: true },
      [],
      NOW,
    );
    expect(entity.media).toMatchObject({ title: "CBC Radio One", artist: "The Current" });
    expect((entity.media?.features ?? 0) & F.volumeSet).toBe(0);
  });
});

describe("Art addresses", () => {
  it("fetches only public https pictures", () => {
    expect(publicHttps("https://i.scdn.co/image/abc")).toBe("https://i.scdn.co/image/abc");
    expect(publicHttps("http://192.168.1.20:1400/getaa?u=x")).toBeNull();
    expect(publicHttps("https://192.168.1.20/a.jpg")).toBeNull();
    expect(publicHttps("https://speaker.local/a.jpg")).toBeNull();
    expect(publicHttps("not a url")).toBeNull();
  });
});

describe("Music widgets", () => {
  it("still load when saved before the provider existed, as Home Assistant players", async () => {
    const { config } = await loadConfig();
    const raw = structuredClone(config) as unknown as { views: { widgets: Record<string, unknown>[] }[] };
    raw.views[0]?.widgets.push({
      id: "old",
      type: "media",
      x: 0,
      y: 0,
      w: 4,
      h: 2,
      entityId: "media_player.kitchen",
      showArt: true,
      showVolume: true,
      showSources: false,
    });
    const parsed = configSchema.parse(raw);
    expect(parsed.views[0]?.widgets.find((w) => w.id === "old")).toMatchObject({ provider: "homeAssistant", playerId: "" });
  });
});

describe("Spotify and Sonos routes", () => {
  useTestServer({
    SPOTIFY_CLIENT_ID: "spotify-id",
    SPOTIFY_CLIENT_SECRET: "spotify-secret",
    SONOS_CLIENT_ID: "sonos-key",
    SONOS_CLIENT_SECRET: "sonos-secret",
    NEXT_PUBLIC_SITE_URL: "https://pane.example.com",
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetMusicForTests();
    resetMusicAuthForTests();
    resetSpotifyForTests();
    resetSonosForTests();
  });

  const media = (id: string, provider: "spotify" | "sonos" | "homeAssistant", playerId = "", x = 0) =>
    ({
      id,
      type: "media",
      x,
      y: 0,
      w: 4,
      h: 2,
      provider,
      entityId: "",
      playerId,
      showArt: true,
      showVolume: true,
      showSources: true,
    }) as const;

  async function setUp(): Promise<string> {
    const stored = await loadConfig();
    const config: DashboardConfig = structuredClone(stored.config);
    const view = config.views[0];
    if (!view) throw new Error("no view");
    view.widgets = [media("m1", "spotify"), media("m2", "sonos", "RINCON_KITCHEN", 4)];
    expect((await saveConfig(config, stored.version)).ok).toBe(true);
    expect(usedPlayers(config)).toEqual({
      spotify: true,
      sonos: new Set(["RINCON_KITCHEN"]),
      sources: new Set(["spotify", "RINCON_KITCHEN"]),
    });
    await setSecret("spotify.refreshToken", "spotify-refresh");
    await setSecret("sonos.refreshToken", "sonos-refresh");
    return (await addDevice("Kitchen", null)).token;
  }

  interface Call {
    url: string;
    method: string;
    auth: string;
    body: string;
  }

  /** Spotify's and Sonos's servers, as recorded shapes. */
  function upstream(calls: Call[], overrides: Record<string, () => Response> = {}) {
    vi.stubGlobal("fetch", (url: string, init: RequestInit = {}) => {
      const headers = (init.headers ?? {}) as Record<string, string>;
      calls.push({ url, method: init.method ?? "GET", auth: headers.Authorization ?? "", body: String(init.body ?? "") });
      const path = url.replace(/\?.*$/, "");
      const o = overrides[path];
      if (o) return Promise.resolve(o());
      if (url === "https://accounts.spotify.com/api/token")
        return Promise.resolve(Response.json({ access_token: "spotify-access", expires_in: 3600 }));
      if (url === "https://api.sonos.com/login/v3/oauth/access")
        return Promise.resolve(Response.json({ access_token: "sonos-access", expires_in: 86399, refresh_token: "sonos-refresh-2" }));
      if (path === "https://api.spotify.com/v1/me/player")
        return Promise.resolve(init.method ? new Response(null, { status: 204 }) : Response.json(playing));
      if (path === "https://api.spotify.com/v1/me/player/devices")
        return Promise.resolve(
          Response.json({
            devices: [
              { id: "dev-kitchen", name: "Kitchen" },
              { id: "dev-car", name: "Car" },
            ],
          }),
        );
      if (url.startsWith("https://api.spotify.com/")) return Promise.resolve(new Response(null, { status: 204 }));
      const sonos = "https://api.ws.sonos.com/control/api/v1";
      if (url === `${sonos}/households`) return Promise.resolve(Response.json({ households: [{ id: "HH1" }] }));
      if (url === `${sonos}/households/HH1/groups`)
        return Promise.resolve(
          Response.json({
            groups: [{ id: "RINCON_KITCHEN:5", name: "Kitchen", playerIds: ["RINCON_KITCHEN"] }],
            players: [
              { id: "RINCON_KITCHEN", name: "Kitchen" },
              { id: "RINCON_DEN", name: "Den" },
            ],
          }),
        );
      if (url === `${sonos}/households/HH1/favorites`) return Promise.resolve(Response.json({ items: [{ id: "7", name: "Morning mix" }] }));
      if (url.endsWith("/playback"))
        return Promise.resolve(Response.json({ playbackState: "PLAYBACK_STATE_PLAYING", positionMillis: 1000 }));
      if (url.endsWith("/playbackMetadata"))
        return Promise.resolve(Response.json({ currentItem: { track: { name: "Song", imageUrl: "http://192.168.1.20:1400/getaa" } } }));
      if (url.endsWith("/groupVolume")) return Promise.resolve(Response.json(init.method === "POST" ? {} : { volume: 30, muted: false }));
      if (url.startsWith(sonos)) return Promise.resolve(Response.json({}));
      if (url.startsWith("https://i.scdn.co/"))
        return Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }));
      return Promise.reject(new Error(`unexpected ${url}`));
    });
  }

  it("gives displays the players widgets show, never a token or an art address", async () => {
    const token = await setUp();
    const calls: Call[] = [];
    upstream(calls);
    const r = await musicGET(req("/api/display/music/", { headers: { "x-display-token": token } }));
    const text = await r.text();
    const data = JSON.parse(text) as MusicData;
    expect(data.services).toEqual({ spotify: { connected: true }, sonos: { connected: true } });
    expect(data.players.spotify).toMatchObject({ state: "playing", media: { title: "Here Comes the Sun", sources: ["Kitchen", "Car"] } });
    expect(data.players["sonos:RINCON_KITCHEN"]).toMatchObject({
      state: "playing",
      name: "Kitchen",
      media: { title: "Song", sources: ["Morning mix"] },
    });
    // The Sonos speaker's art is on the home network, so none is offered.
    expect(data.players["sonos:RINCON_KITCHEN"]?.media?.art).toBeUndefined();
    expect(data.players.spotify?.media?.art).toMatch(/^[0-9a-f]{16}$/);
    for (const secret of ["spotify-access", "sonos-access", "spotify-refresh", "i.scdn.co"]) expect(text).not.toContain(secret);
    expect(calls.find((c) => c.url.startsWith("https://api.spotify.com/"))?.auth).toBe("Bearer spotify-access");
    expect(calls.find((c) => c.url.startsWith("https://api.ws.sonos.com/"))?.auth).toBe("Bearer sonos-access");
    // Sonos gave a new refresh token; the old one can stop working.
    expect(await getSecret("sonos.refreshToken")).toBe("sonos-refresh-2");
    expect((await musicGET(req("/api/display/music/"))).status).toBe(401);
  });

  it("says a service isn't connected rather than failing the other", async () => {
    const token = await setUp();
    await setSecret("sonos.refreshToken", null);
    const calls: Call[] = [];
    upstream(calls, { "https://api.spotify.com/v1/me/player": () => new Response("{}", { status: 500 }) });
    const data = (await (await musicGET(req("/api/display/music/", { headers: { "x-display-token": token } }))).json()) as MusicData;
    expect(data.services.sonos).toEqual({ connected: false });
    expect(data.services.spotify).toEqual({ connected: true, error: "Spotify answered 500" });
  });

  it("passes on allowed taps only, for players a widget shows", async () => {
    const token = await setUp();
    const calls: Call[] = [];
    upstream(calls);
    const tap = (body: object) =>
      musicPOST(req("/api/display/music/", { method: "POST", headers: { "x-display-token": token }, body: JSON.stringify(body) }));
    expect((await tap({ player: "spotify", action: "playPause" })).status).toBe(200);
    expect((await tap({ player: "spotify", action: "volume", value: 140 })).status).toBe(200);
    expect((await tap({ player: "spotify", action: "source", option: "Car" })).status).toBe(200);
    expect((await tap({ player: "spotify", action: "source", option: "Neighbour's speaker" })).status).toBe(403);
    expect((await tap({ player: "spotify", action: "mute" })).status).toBe(403);
    expect((await tap({ player: "sonos:RINCON_KITCHEN", action: "next" })).status).toBe(200);
    expect((await tap({ player: "sonos:RINCON_KITCHEN", action: "volume", value: 35 })).status).toBe(200);
    expect((await tap({ player: "sonos:RINCON_KITCHEN", action: "source", option: "Morning mix" })).status).toBe(200);
    expect((await tap({ player: "sonos:RINCON_DEN", action: "playPause" })).status).toBe(403);
    expect((await tap({ player: "spotify", action: "unlock" })).status).toBe(400);
    const writes = calls.filter((c) => c.method !== "GET" && !c.url.includes("/oauth") && !c.url.includes("/api/token"));
    expect(writes.map((c) => [c.method, c.url.replace(/^https:\/\/[^/]+/, ""), c.body])).toEqual([
      ["PUT", "/v1/me/player/pause", ""],
      ["PUT", "/v1/me/player/volume?volume_percent=100", ""],
      ["PUT", "/v1/me/player", JSON.stringify({ device_ids: ["dev-car"], play: true })],
      ["POST", "/control/api/v1/groups/RINCON_KITCHEN%3A5/playback/skipToNextTrack", "{}"],
      ["POST", "/control/api/v1/groups/RINCON_KITCHEN%3A5/groupVolume", JSON.stringify({ volume: 35 })],
      [
        "POST",
        "/control/api/v1/groups/RINCON_KITCHEN%3A5/favorites",
        JSON.stringify({ favoriteId: "7", playOnCompletion: true, action: "REPLACE" }),
      ],
    ]);
    const other = req("/api/display/music/", {
      method: "POST",
      headers: { "x-display-token": token, origin: "https://evil.example" },
      body: JSON.stringify({ player: "spotify", action: "next" }),
    });
    expect((await musicPOST(other)).status).toBe(403);
  });

  it("explains a refusal for want of Premium", async () => {
    const token = await setUp();
    upstream([], {
      "https://api.spotify.com/v1/me/player/next": () =>
        Response.json({ error: { status: 403, reason: "PREMIUM_REQUIRED" } }, { status: 403 }),
    });
    const r = await musicPOST(
      req("/api/display/music/", {
        method: "POST",
        headers: { "x-display-token": token },
        body: JSON.stringify({ player: "spotify", action: "next" }),
      }),
    );
    expect(r.status).toBe(502);
    expect(((await r.json()) as { error: string }).error).toBe("Controlling Spotify needs Premium");
  });

  it("serves only art the feed itself read", async () => {
    const token = await setUp();
    const calls: Call[] = [];
    upstream(calls);
    const data = (await (await musicGET(req("/api/display/music/", { headers: { "x-display-token": token } }))).json()) as MusicData;
    const k = data.players.spotify?.media?.art ?? "";
    const ok = await artGET(req(`/api/display/art/?p=spotify&k=${k}&t=${token}`));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/jpeg");
    expect((await artGET(req(`/api/display/art/?p=spotify&k=0123456789abcdef&t=${token}`))).status).toBe(404);
    expect((await artGET(req(`/api/display/art/?p=spotify&k=${k}`))).status).toBe(401);
    expect(calls.filter((c) => c.url.startsWith("https://i.scdn.co/")).map((c) => c.url)).toEqual(["https://i.scdn.co/image/300"]);
  });

  it("signs in with a state the callback checks, and keeps the token on the server", async () => {
    const admin = await cookieFor("admin@example.com");
    const start = await connectGET(req("/api/music/spotify/connect/", { headers: { cookie: admin } }));
    expect(start.status).toBe(303);
    const location = new URL(start.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe("https://accounts.spotify.com/authorize");
    expect(location.searchParams.get("redirect_uri")).toBe("https://pane.example.com/api/music/spotify/callback/");
    expect(location.searchParams.get("scope")).toContain("user-modify-playback-state");
    const state = location.searchParams.get("state") ?? "";
    const cookie = /ep_music_state=([^;]+)/.exec(start.headers.get("set-cookie") ?? "")?.[1] ?? "";
    expect(cookie).toBe(state);

    const calls: Call[] = [];
    upstream(calls, {
      "https://accounts.spotify.com/api/token": () => Response.json({ access_token: "a", expires_in: 3600, refresh_token: "new-refresh" }),
    });
    const forged = await callbackGET(
      req(`/api/music/spotify/callback/?code=c&state=other`, { headers: { cookie: `${admin}; ep_music_state=${state}` } }),
    );
    expect(forged.headers.get("location")).toBe("/admin/?spotify=expired#settings");
    const back = await callbackGET(
      req(`/api/music/spotify/callback/?code=c&state=${state}`, { headers: { cookie: `${admin}; ep_music_state=${state}` } }),
    );
    expect(back.headers.get("location")).toBe("/admin/?spotify=connected#settings");
    expect(await getSecret("spotify.refreshToken")).toBe("new-refresh");
    expect(calls[0]?.auth).toBe(`Basic ${Buffer.from("spotify-id:spotify-secret").toString("base64")}`);

    const status = await (await adminGET(req("/api/admin/music/", { headers: { cookie: admin } }))).text();
    expect(JSON.parse(status)).toMatchObject({
      spotify: { configured: true, connected: true },
      sonos: { configured: true, connected: false },
    });
    expect(status).not.toContain("new-refresh");

    expect((await adminDELETE(req("/api/admin/music/?service=spotify", { method: "DELETE", headers: { cookie: admin } }))).status).toBe(
      200,
    );
    expect(await getSecret("spotify.refreshToken")).toBeNull();
    const kid = await cookieFor("kid@example.com");
    expect((await connectGET(req("/api/music/spotify/connect/", { headers: { cookie: kid } }))).status).toBe(401);
  });

  it("lists the Sonos speakers for the widget's picker", async () => {
    await setUp();
    upstream([]);
    const admin = await cookieFor("admin@example.com");
    const body = (await (await adminGET(req("/api/admin/music/", { headers: { cookie: admin } }))).json()) as {
      sonos: { players: { id: string; name: string }[] };
    };
    expect(body.sonos.players).toEqual([
      { id: "RINCON_DEN", name: "Den" },
      { id: "RINCON_KITCHEN", name: "Kitchen" },
    ]);
  });
});
