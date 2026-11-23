import "server-only";

import { z } from "zod";

import type { MusicService } from "@/lib/display/types";

import { randomToken } from "./crypto";
import { env } from "./env";
import { getSecret, setSecret } from "./secrets";

// Signing in to Spotify and Sonos directly (Melvin, 2026-11-18: alongside the Home Assistant route). Both are plain
// OAuth authorization-code flows with the client secret sent as Basic auth: an admin connects each account once from
// Settings, the refresh token is stored encrypted, and access tokens live only in this instance's memory.

interface ServiceInfo {
  label: string;
  authUrl: string;
  tokenUrl: string;
  scope: string;
  clientId: () => string;
  clientSecret: () => string;
  extraAuth?: Record<string, string>;
}

const SERVICES: Record<MusicService, ServiceInfo> = {
  spotify: {
    label: "Spotify",
    authUrl: "https://accounts.spotify.com/authorize",
    tokenUrl: "https://accounts.spotify.com/api/token",
    // Read what's playing and on which speakers, and control it. Controlling needs Spotify Premium.
    scope: "user-read-playback-state user-modify-playback-state user-read-currently-playing",
    clientId: env.spotifyClientId,
    clientSecret: env.spotifyClientSecret,
    // Ask every time, so connecting a different family member's account works.
    extraAuth: { show_dialog: "true" },
  },
  sonos: {
    label: "Sonos",
    authUrl: "https://api.sonos.com/login/v3/oauth",
    tokenUrl: "https://api.sonos.com/login/v3/oauth/access",
    scope: "playback-control-all",
    clientId: env.sonosClientId,
    clientSecret: env.sonosClientSecret,
  },
};

export const MUSIC_STATE_COOKIE = "ep_music_state";

/** Thrown when the service no longer accepts the stored token (revoked, or the app was removed from the account). */
export class MusicDisconnected extends Error {
  constructor(readonly service: MusicService) {
    super(`${SERVICES[service].label} needs to be connected again`);
  }
}

export const musicLabel = (s: MusicService) => SERVICES[s].label;
export const musicConfigured = (s: MusicService) => Boolean(SERVICES[s].clientId() && SERVICES[s].clientSecret());
const tokenKey = (s: MusicService): "spotify.refreshToken" | "sonos.refreshToken" =>
  s === "spotify" ? "spotify.refreshToken" : "sonos.refreshToken";

/** Where the service sends the admin back. Must match the redirect URI registered on the developer app. */
export const musicRedirectUri = (s: MusicService, origin: string) => `${env.siteUrl() || origin}/api/music/${s}/callback/`;

export function musicConsentUrl(s: MusicService, state: string, redirect: string): string {
  const info = SERVICES[s];
  const p = new URLSearchParams({
    client_id: info.clientId(),
    response_type: "code",
    redirect_uri: redirect,
    scope: info.scope,
    state,
    ...info.extraAuth,
  });
  return `${info.authUrl}?${p}`;
}

export const newMusicState = () => randomToken(24);

export function musicStateCookie(value: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${MUSIC_STATE_COOKIE}=${value}; Path=/api/music/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
}
export const clearedMusicStateCookie = () => `${MUSIC_STATE_COOKIE}=; Path=/api/music/; HttpOnly; SameSite=Lax; Max-Age=0`;

const tokenSchema = z.object({ access_token: z.string(), expires_in: z.number(), refresh_token: z.string().optional() });

async function tokenRequest(s: MusicService, params: Record<string, string>): Promise<z.infer<typeof tokenSchema>> {
  const info = SERVICES[s];
  const basic = Buffer.from(`${info.clientId()}:${info.clientSecret()}`).toString("base64");
  const r = await fetch(info.tokenUrl, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 400 || r.status === 401) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    if (body.error === "invalid_grant" || body.error === "invalid_token") throw new MusicDisconnected(s);
    throw new Error(`${info.label} refused the request (${body.error ?? r.status})`);
  }
  if (!r.ok) throw new Error(`${info.label} answered ${r.status}`);
  return tokenSchema.parse(await r.json());
}

const accessKey = (accountId: string, s: MusicService) => `${accountId}:${s}`;

const access = new Map<string, { token: string; expiresAt: number; refresh: string }>();

/** Trades the one-time code from the sign-in page for a refresh token and stores it. */
export async function connectMusic(
  accountId: string,
  s: MusicService,
  code: string,
  redirect: string,
  now = Date.now(),
): Promise<void> {
  const t = await tokenRequest(s, { grant_type: "authorization_code", code, redirect_uri: redirect });
  if (!t.refresh_token) throw new Error(`${SERVICES[s].label} didn't send a refresh token`);
  await setSecret(accountId, tokenKey(s), t.refresh_token, now);
  access.set(accessKey(accountId, s), { token: t.access_token, expiresAt: now + (t.expires_in - 60) * 1000, refresh: t.refresh_token });
}

/** Forgets the token here. Neither service has a revoke endpoint; the account owner can remove the app on their side. */
export async function disconnectMusic(accountId: string, s: MusicService): Promise<void> {
  access.delete(accessKey(accountId, s));
  await setSecret(accountId, tokenKey(s), null);
}

export async function musicConnected(accountId: string, s: MusicService): Promise<boolean> {
  return Boolean(await getSecret(accountId, tokenKey(s)));
}

export async function musicToken(accountId: string, s: MusicService, now = Date.now()): Promise<string> {
  const refresh = await getSecret(accountId, tokenKey(s));
  if (!refresh) throw new MusicDisconnected(s);
  const key = accessKey(accountId, s);
  const held = access.get(key);
  if (held && held.refresh === refresh && held.expiresAt > now) return held.token;
  try {
    const t = await tokenRequest(s, { grant_type: "refresh_token", refresh_token: refresh });
    // Either service may hand out a new refresh token; the old one can stop working, so keep the new one.
    const next = t.refresh_token ?? refresh;
    if (next !== refresh) await setSecret(accountId, tokenKey(s), next, now);
    access.set(key, { token: t.access_token, expiresAt: now + (t.expires_in - 60) * 1000, refresh: next });
    return t.access_token;
  } catch (error) {
    if (error instanceof MusicDisconnected) access.delete(key);
    throw error;
  }
}

/** Drops the access token after the service refused it (a 401 from its API), so the next call refreshes. */
export const dropMusicToken = (accountId: string, s: MusicService) => void access.delete(accessKey(accountId, s));

/** Tests only. */
export function resetMusicAuthForTests(): void {
  access.clear();
}
