import "server-only";

import type { MusicService } from "@/lib/display/types";

import { readCookie } from "./auth";
import { safeEqual } from "./crypto";
import { json, unauthorized } from "./http";
import {
  clearedMusicStateCookie,
  connectMusic,
  MUSIC_STATE_COOKIE,
  musicConfigured,
  musicConsentUrl,
  musicRedirectUri,
  musicStateCookie,
  newMusicState,
} from "./musicAuth";
import { adminFor } from "./viewer";

// The sign-in round trip for Spotify and Sonos, shared by /api/music/<service>/connect/ and /callback/. The one-time
// state value in a cookie makes sure the code coming back belongs to the admin who started, so nobody can trick an
// admin's browser into connecting someone else's account.

const ENV_NAMES: Record<MusicService, string> = {
  spotify: "SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET",
  sonos: "SONOS_CLIENT_ID and SONOS_CLIENT_SECRET",
};

export async function startMusicConnect(service: MusicService, req: Request): Promise<Response> {
  if (!(await adminFor(req))) return unauthorized();
  if (!musicConfigured(service)) return json({ error: `${ENV_NAMES[service]} aren't set` }, 503);
  const state = newMusicState();
  return new Response(null, {
    status: 303,
    headers: {
      Location: musicConsentUrl(service, state, musicRedirectUri(service, new URL(req.url).origin)),
      "Set-Cookie": musicStateCookie(state),
      "Cache-Control": "no-store",
    },
  });
}

export async function finishMusicConnect(service: MusicService, req: Request): Promise<Response> {
  if (!(await adminFor(req))) return unauthorized();
  const url = new URL(req.url);
  const back = (result: string) =>
    new Response(null, {
      status: 303,
      headers: { Location: `/admin/?${service}=${result}#settings`, "Set-Cookie": clearedMusicStateCookie(), "Cache-Control": "no-store" },
    });
  const state = url.searchParams.get("state") ?? "";
  const expected = readCookie(req, MUSIC_STATE_COOKIE) ?? "";
  if (!state || !expected || !safeEqual(state, expected)) return back("expired");
  const code = url.searchParams.get("code");
  if (!code) return back("cancelled");
  try {
    await connectMusic(service, code, musicRedirectUri(service, url.origin));
  } catch (error) {
    console.error(`${service} connection failed`, error);
    return back("failed");
  }
  return back("connected");
}
