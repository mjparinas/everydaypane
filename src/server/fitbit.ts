import "server-only";

import { z } from "zod";

import type { FitbitData } from "@/lib/display/types";

import { cached, forget } from "./cache";
import { randomToken } from "./crypto";
import { env } from "./env";
import { getSecret, setSecret } from "./secrets";

// Fitbit OAuth (Phase 5): steps, sleep and resting heart rate for today.

const AUTH = "https://www.fitbit.com/oauth2";
const API = "https://api.fitbit.com/1";
const TTL = 5 * 60_000;
export const FITBIT_STATE_COOKIE = "ep_fitbit_state";

export class FitbitDisconnected extends Error {
  constructor() {
    super("Connect Fitbit under Settings");
  }
}

const access = new Map<string, { token: string; expiresAt: number; refresh: string }>();

export const fitbitConfigured = () => Boolean(env.fitbitClientId() && env.fitbitClientSecret());
export const fitbitRedirect = (origin: string) => `${env.siteUrl() || origin}/api/fitbit/callback/`;

export function fitbitConsentUrl(state: string, redirect: string): string {
  const p = new URLSearchParams({
    client_id: env.fitbitClientId(),
    response_type: "code",
    code_challenge: state,
    code_challenge_method: "plain",
    scope: "activity heartrate sleep profile",
    redirect_uri: redirect,
    state,
  });
  return `${AUTH}/authorize?${p}`;
}

export const newFitbitState = () => randomToken(24);

const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
});

async function refreshToken(accountId: string, now = Date.now()): Promise<string> {
  const refresh = await getSecret(accountId, "fitbit.refreshToken");
  if (!refresh) throw new FitbitDisconnected();
  const held = access.get(accountId);
  if (held && held.refresh === refresh && held.expiresAt > now) return held.token;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refresh,
    client_id: env.fitbitClientId(),
  });
  const r = await fetch(`${AUTH}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${env.fitbitClientId()}:${env.fitbitClientSecret()}`).toString("base64")}`,
    },
    body,
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 401) throw new FitbitDisconnected();
  if (!r.ok) throw new Error(`Fitbit refused refresh (${r.status})`);
  const t = tokenSchema.parse(await r.json());
  await setSecret(accountId, "fitbit.refreshToken", t.refresh_token);
  access.set(accountId, { token: t.access_token, expiresAt: now + (t.expires_in - 60) * 1000, refresh: t.refresh_token });
  return t.access_token;
}

export async function connectFitbit(accountId: string, code: string, redirect: string, now = Date.now()): Promise<void> {
  const body = new URLSearchParams({
    client_id: env.fitbitClientId(),
    grant_type: "authorization_code",
    redirect_uri: redirect,
    code,
  });
  const r = await fetch(`${AUTH}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${env.fitbitClientId()}:${env.fitbitClientSecret()}`).toString("base64")}`,
    },
    body,
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error("Fitbit refused the code");
  const t = tokenSchema.parse(await r.json());
  await setSecret(accountId, "fitbit.refreshToken", t.refresh_token, now);
  access.set(accountId, { token: t.access_token, expiresAt: now + (t.expires_in - 60) * 1000, refresh: t.refresh_token });
  await forget("fitbit:");
}

async function getPath(accountId: string, path: string): Promise<unknown> {
  const token = await refreshToken(accountId);
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
  if (r.status === 401) throw new FitbitDisconnected();
  if (!r.ok) throw new Error(`Fitbit answered ${r.status}`);
  return r.json();
}

export async function fitbitFeed(accountId: string, today: string): Promise<FitbitData> {
  const key = `fitbit:${accountId}:${today}`;
  const { value, fetchedAt, stale } = await cached(key, TTL, async () => {
    const stepsRaw = (await getPath(accountId, `/user/-/activities/date/${today}.json`)) as { summary?: { steps?: number } };
    const sleepRaw = (await getPath(accountId, `/user/-/sleep/date/${today}.json`)) as { summary?: { totalMinutesAsleep?: number } };
    const heartRaw = (await getPath(accountId, `/user/-/activities/heart/date/${today}/1d.json`)) as {
      "activities-heart"?: { value?: { restingHeartRate?: number } }[];
    };
    return {
      steps: stepsRaw.summary?.steps ?? 0,
      sleepMinutes: sleepRaw.summary?.totalMinutesAsleep ?? 0,
      restingHeartRate: heartRaw["activities-heart"]?.[0]?.value?.restingHeartRate,
    };
  });
  const v = value as Omit<FitbitData, "updatedAt" | "stale" | "connected">;
  return { updatedAt: fetchedAt, stale, connected: true, ...v };
}
