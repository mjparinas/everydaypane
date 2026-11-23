import "server-only";

import { z } from "zod";

import { randomToken } from "./crypto";
import { env } from "./env";
import { getSecret, setSecret, type SecretKey } from "./secrets";

export type PhotoOAuthService = "dropbox" | "box" | "flickr" | "smugmug";

interface OAuthInfo {
  label: string;
  authUrl: string;
  tokenUrl: string;
  scope: string;
  clientId: () => string;
  clientSecret: () => string;
  extraAuth?: Record<string, string>;
}

const SERVICES: Record<PhotoOAuthService, OAuthInfo> = {
  dropbox: {
    label: "Dropbox",
    authUrl: "https://www.dropbox.com/oauth2/authorize",
    tokenUrl: "https://api.dropboxapi.com/oauth2/token",
    scope: "files.metadata.read files.content.read",
    clientId: env.dropboxClientId,
    clientSecret: env.dropboxClientSecret,
  },
  box: {
    label: "Box",
    authUrl: "https://account.box.com/api/oauth2/authorize",
    tokenUrl: "https://api.box.com/oauth2/token",
    scope: "root_readonly",
    clientId: env.boxClientId,
    clientSecret: env.boxClientSecret,
  },
  flickr: {
    label: "Flickr",
    authUrl: "https://www.flickr.com/services/oauth/authorize",
    tokenUrl: "https://www.flickr.com/services/oauth/get_access_token",
    scope: "read",
    clientId: env.flickrApiKey,
    clientSecret: env.flickrSecret,
  },
  smugmug: {
    label: "SmugMug",
    authUrl: "https://api.smugmug.com/services/oauth/1.0a/authorize",
    tokenUrl: "https://api.smugmug.com/services/oauth/1.0a/getAccessToken",
    scope: "Read",
    clientId: env.smugmugApiKey,
    clientSecret: env.smugmugSecret,
  },
};

export const PHOTO_OAUTH_STATE = "ep_photo_oauth_state";
const tokenKey = (s: PhotoOAuthService): SecretKey =>
  s === "dropbox"
    ? "dropbox.refreshToken"
    : s === "box"
      ? "box.refreshToken"
      : s === "flickr"
        ? "flickr.refreshToken"
        : "smugmug.refreshToken";

export const photoOAuthLabel = (s: PhotoOAuthService) => SERVICES[s].label;
export const photoOAuthConfigured = (s: PhotoOAuthService) => Boolean(SERVICES[s].clientId() && SERVICES[s].clientSecret());

export const photoOAuthRedirect = (s: PhotoOAuthService, origin: string) => `${env.siteUrl() || origin}/api/photos/${s}/callback/`;

export function photoOAuthConsentUrl(s: PhotoOAuthService, state: string, redirect: string): string {
  const info = SERVICES[s];
  const p = new URLSearchParams({
    client_id: info.clientId(),
    response_type: "code",
    redirect_uri: redirect,
    state,
    ...(info.scope ? { scope: info.scope } : {}),
    ...info.extraAuth,
  });
  return `${info.authUrl}?${p}`;
}

export const newPhotoOAuthState = () => randomToken(24);

export function photoOAuthStateCookie(value: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${PHOTO_OAUTH_STATE}=${value}; Path=/api/photos/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
}
export const clearedPhotoOAuthStateCookie = () => `${PHOTO_OAUTH_STATE}=; Path=/api/photos/; HttpOnly; SameSite=Lax; Max-Age=0`;

const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
});

const tokens = new Map<string, { access: string; expiresAt: number; refresh: string }>();

export async function connectPhotoOAuth(
  accountId: string,
  service: PhotoOAuthService,
  code: string,
  redirect: string,
  now = Date.now(),
): Promise<void> {
  const info = SERVICES[service];
  const r = await fetch(info.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: info.clientId(),
      client_secret: info.clientSecret(),
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`${info.label} refused the code`);
  const t = tokenSchema.parse(await r.json());
  if (!t.refresh_token) throw new Error(`${info.label} didn't send a refresh token`);
  await setSecret(accountId, tokenKey(service), t.refresh_token, now);
  tokens.set(`${service}:${accountId}`, {
    access: t.access_token,
    expiresAt: now + ((t.expires_in ?? 3600) - 60) * 1000,
    refresh: t.refresh_token,
  });
}

async function refreshOAuth(service: PhotoOAuthService, accountId: string, now = Date.now()): Promise<string> {
  const info = SERVICES[service];
  const refresh = await getSecret(accountId, tokenKey(service));
  if (!refresh) throw new Error(`${info.label} isn't connected`);
  const held = tokens.get(`${service}:${accountId}`);
  if (held && held.refresh === refresh && held.expiresAt > now) return held.access;
  const r = await fetch(info.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: info.clientId(),
      client_secret: info.clientSecret(),
      grant_type: "refresh_token",
      refresh_token: refresh,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`${info.label} needs to be connected again`);
  const t = tokenSchema.parse(await r.json());
  tokens.set(`${service}:${accountId}`, {
    access: t.access_token,
    expiresAt: now + ((t.expires_in ?? 3600) - 60) * 1000,
    refresh,
  });
  return t.access_token;
}

export const dropboxAccessToken = (accountId: string, now = Date.now()) => refreshOAuth("dropbox", accountId, now);
export const boxAccessToken = (accountId: string, now = Date.now()) => refreshOAuth("box", accountId, now);
export const flickrAccessToken = async (accountId: string, now = Date.now()) => {
  try {
    return await refreshOAuth("flickr", accountId, now);
  } catch {
    return null;
  }
};
export const smugmugAccessToken = (accountId: string, now = Date.now()) => refreshOAuth("smugmug", accountId, now);

export const boxConfigured = () => photoOAuthConfigured("box");
export const flickrConfigured = () => Boolean(env.flickrApiKey());
export const smugmugConfigured = () => photoOAuthConfigured("smugmug");
