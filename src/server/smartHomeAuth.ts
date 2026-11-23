import "server-only";

import { z } from "zod";

import type { NativeSmartProvider } from "@/lib/smartHome";

import { randomToken } from "./crypto";
import { env } from "./env";
import { getSecret, setSecret } from "./secrets";

// OAuth for Nest (Google Device Access), ecobee and SmartThings (Phase 4, Household). One refresh token per service
// per account, encrypted like music and calendar tokens.

interface ServiceInfo {
  label: string;
  authUrl: (redirect: string, state: string, extra?: Record<string, string>) => string;
  tokenUrl: string;
  scope: string;
  clientId: () => string;
  clientSecret: () => string;
  /** Extra fields on the token request (Nest needs the project id). */
  tokenExtra?: () => Record<string, string>;
}

export class SmartHomeDisconnected extends Error {
  constructor(readonly service: NativeSmartProvider) {
    super(`${SERVICES[service].label} needs to be connected again`);
  }
}

const SERVICES: Record<NativeSmartProvider, ServiceInfo> = {
  nest: {
    label: "Nest",
    scope: "https://www.googleapis.com/auth/sdm.service",
    clientId: () => env.nestClientId() || env.googleClientId(),
    clientSecret: () => env.nestClientSecret() || env.googleClientSecret(),
    authUrl: (redirect, state) => {
      const project = env.nestProjectId();
      if (!project) throw new Error("NEST_PROJECT_ID isn't set");
      const p = new URLSearchParams({
        client_id: SERVICES.nest.clientId(),
        redirect_uri: redirect,
        response_type: "code",
        scope: SERVICES.nest.scope,
        access_type: "offline",
        prompt: "consent",
        state,
      });
      return `https://nestservices.google.com/partnerconnections/${project}/auth?${p}`;
    },
    tokenUrl: "https://oauth2.googleapis.com/token",
  },
  ecobee: {
    label: "ecobee",
    scope: "smartWrite",
    clientId: env.ecobeeClientId,
    clientSecret: env.ecobeeClientSecret,
    authUrl: (redirect, state) => {
      const p = new URLSearchParams({
        response_type: "code",
        client_id: SERVICES.ecobee.clientId(),
        redirect_uri: redirect,
        scope: SERVICES.ecobee.scope,
        state,
      });
      return `https://api.ecobee.com/authorize?${p}`;
    },
    tokenUrl: "https://api.ecobee.com/token",
  },
  smartthings: {
    label: "SmartThings",
    scope: "r:devices:* w:devices:* x:devices:*",
    clientId: env.smartthingsClientId,
    clientSecret: env.smartthingsClientSecret,
    authUrl: (redirect, state) => {
      const p = new URLSearchParams({
        client_id: SERVICES.smartthings.clientId(),
        response_type: "code",
        redirect_uri: redirect,
        scope: SERVICES.smartthings.scope,
        state,
      });
      return `https://api.smartthings.com/oauth/authorize?${p}`;
    },
    tokenUrl: "https://auth-global.api.smartthings.com/oauth/token",
  },
};

export const SMART_STATE_COOKIE = "ep_smart_state";

export const smartLabel = (s: NativeSmartProvider) => SERVICES[s].label;

export function smartConfigured(s: NativeSmartProvider): boolean {
  if (s === "nest") {
    return Boolean(
      (env.nestClientId() || env.googleClientId()) && (env.nestClientSecret() || env.googleClientSecret()) && env.nestProjectId(),
    );
  }
  return Boolean(SERVICES[s].clientId() && SERVICES[s].clientSecret());
}

const tokenKey = (s: NativeSmartProvider): `${NativeSmartProvider}.refreshToken` => `${s}.refreshToken`;

export const smartRedirectUri = (s: NativeSmartProvider, origin: string) => `${env.siteUrl() || origin}/api/smart-home/${s}/callback/`;

export function smartConsentUrl(s: NativeSmartProvider, state: string, redirect: string): string {
  return SERVICES[s].authUrl(redirect, state);
}

export const newSmartState = () => randomToken(24);

export function smartStateCookie(value: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SMART_STATE_COOKIE}=${value}; Path=/api/smart-home/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
}
export const clearedSmartStateCookie = () => `${SMART_STATE_COOKIE}=; Path=/api/smart-home/; HttpOnly; SameSite=Lax; Max-Age=0`;

const tokenSchema = z.object({ access_token: z.string(), expires_in: z.number(), refresh_token: z.string().optional() });

async function tokenRequest(s: NativeSmartProvider, params: Record<string, string>): Promise<z.infer<typeof tokenSchema>> {
  const info = SERVICES[s];
  const basic = Buffer.from(`${info.clientId()}:${info.clientSecret()}`).toString("base64");
  const r = await fetch(info.tokenUrl, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams({ ...params, ...(info.tokenExtra?.() ?? {}) }),
    signal: AbortSignal.timeout(12_000),
  });
  if (r.status === 400 || r.status === 401) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    if (body.error === "invalid_grant" || body.error === "invalid_token") throw new SmartHomeDisconnected(s);
    throw new Error(`${info.label} refused the request (${body.error ?? r.status})`);
  }
  if (!r.ok) throw new Error(`${info.label} answered ${r.status}`);
  return tokenSchema.parse(await r.json());
}

const accessKey = (accountId: string, s: NativeSmartProvider) => `${accountId}:${s}`;
const access = new Map<string, { token: string; expiresAt: number; refresh: string }>();

export async function connectSmartHome(
  accountId: string,
  s: NativeSmartProvider,
  code: string,
  redirect: string,
  now = Date.now(),
): Promise<void> {
  const t = await tokenRequest(s, { grant_type: "authorization_code", code, redirect_uri: redirect });
  if (!t.refresh_token) throw new Error(`${SERVICES[s].label} didn't send a refresh token`);
  await setSecret(accountId, tokenKey(s), t.refresh_token, now);
  access.set(accessKey(accountId, s), { token: t.access_token, expiresAt: now + (t.expires_in - 60) * 1000, refresh: t.refresh_token });
}

export async function disconnectSmartHome(accountId: string, s: NativeSmartProvider): Promise<void> {
  access.delete(accessKey(accountId, s));
  await setSecret(accountId, tokenKey(s), null);
}

export async function smartHomeConnected(accountId: string, s: NativeSmartProvider): Promise<boolean> {
  return Boolean(await getSecret(accountId, tokenKey(s)));
}

export async function smartHomeToken(accountId: string, s: NativeSmartProvider, now = Date.now()): Promise<string> {
  const refresh = await getSecret(accountId, tokenKey(s));
  if (!refresh) throw new SmartHomeDisconnected(s);
  const key = accessKey(accountId, s);
  const held = access.get(key);
  if (held && held.refresh === refresh && held.expiresAt > now) return held.token;
  try {
    const t = await tokenRequest(s, { grant_type: "refresh_token", refresh_token: refresh });
    const next = t.refresh_token ?? refresh;
    if (next !== refresh) await setSecret(accountId, tokenKey(s), next, now);
    access.set(key, { token: t.access_token, expiresAt: now + (t.expires_in - 60) * 1000, refresh: next });
    return t.access_token;
  } catch (error) {
    if (error instanceof SmartHomeDisconnected) access.delete(key);
    throw error;
  }
}

export const dropSmartHomeToken = (accountId: string, s: NativeSmartProvider) => void access.delete(accessKey(accountId, s));

/** Tests only. */
export function resetSmartHomeAuthForTests(): void {
  access.clear();
}
