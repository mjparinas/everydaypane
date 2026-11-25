import "server-only";

import { addDays } from "@/lib/calendar";
import type { OuraData, OuraNight, OuraSummary } from "@/lib/display/types";

import { cached, forget } from "./cache";
import { randomToken } from "./crypto";
import { env } from "./env";
import { getSecret, setSecret } from "./secrets";

// Oura ring (Melvin, 2026-11-21: "do all 6", one of the native integrations from the coordinator's list). Oura's API
// v2 with OAuth: Oura removed personal access tokens in December 2025, so an admin connects the ring's account once
// from Settings › Content & finance. Only the `daily` scope is asked for (sleep, readiness and activity summaries and
// the night's sleep periods); nothing is ever written to Oura.
//
// Oura's refresh tokens are single use: each refresh hands back a new one and the old one stops working. Two server
// instances refreshing at once would sign the ring out, so the access token (about a day long) is stored encrypted
// next to the refresh token and shared by every instance, a refresh happens at most once per instance at a time, and
// a refused refresh first checks whether another instance already stored a newer token.

const AUTH_URL = "https://cloud.ouraring.com/oauth/authorize";
const TOKEN_URL = "https://api.ouraring.com/oauth/token";
const REVOKE_URL = "https://api.ouraring.com/oauth/revoke";
const API = "https://api.ouraring.com/v2/usercollection";
/** The ring syncs when the phone app opens, so new numbers arrive a few times a day at most. */
const TTL = 15 * 60_000;
export const OURA_STATE_COOKIE = "ep_oura_state";

export class OuraDisconnected extends Error {
  constructor() {
    super("Connect Oura again under Settings");
  }
}

/** Oura answers 403 when the ring's membership has lapsed: the API serves members only. */
export class OuraMembershipNeeded extends Error {
  constructor() {
    super("Oura shares data only with an active Oura Membership");
  }
}

export const ouraConfigured = () => Boolean(env.ouraClientId() && env.ouraClientSecret());
export const ouraRedirect = (origin: string) => `${env.siteUrl() || origin}/api/oura/callback/`;
export const newOuraState = () => randomToken(24);

export function ouraConsentUrl(state: string, redirect: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: env.ouraClientId(),
    redirect_uri: redirect,
    scope: "daily",
    state,
  });
  return `${AUTH_URL}?${p}`;
}

export function ouraStateCookie(value: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${OURA_STATE_COOKIE}=${value}; Path=/api/oura/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
}

interface TokenSet {
  token: string;
  expiresAt: number;
}

function readTokenSet(raw: string | null): TokenSet | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<TokenSet>;
    return typeof v.token === "string" && typeof v.expiresAt === "number" ? { token: v.token, expiresAt: v.expiresAt } : null;
  } catch {
    return null;
  }
}

interface TokenAnswer {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

function parseTokenAnswer(body: unknown): TokenAnswer {
  const b = body as Partial<TokenAnswer> | null;
  if (!b || typeof b.access_token !== "string" || typeof b.refresh_token !== "string") throw new Error("Oura sent no token");
  return {
    access_token: b.access_token,
    refresh_token: b.refresh_token,
    expires_in: typeof b.expires_in === "number" ? b.expires_in : 86_400,
  };
}

async function tokenRequest(params: Record<string, string>): Promise<TokenAnswer> {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, client_id: env.ouraClientId(), client_secret: env.ouraClientSecret() }),
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 400 || r.status === 401) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    if (body.error === "invalid_grant" || r.status === 401) throw new OuraDisconnected();
    throw new Error(`Oura refused the request (${body.error ?? r.status})`);
  }
  if (!r.ok) throw new Error(`Oura answered ${r.status}`);
  return parseTokenAnswer(await r.json());
}

async function store(accountId: string, t: TokenAnswer, now: number): Promise<string> {
  // The refresh token first: if the second write failed, the next call refreshes with the token that still works.
  await setSecret(accountId, "oura.refreshToken", t.refresh_token, now);
  const set: TokenSet = { token: t.access_token, expiresAt: now + (t.expires_in - 120) * 1000 };
  await setSecret(accountId, "oura.accessToken", JSON.stringify(set), now);
  return t.access_token;
}

/** Trades the one-time code from Oura's sign-in page for tokens and stores them. */
export async function connectOura(accountId: string, code: string, redirect: string, now = Date.now()): Promise<void> {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirect });
  await store(accountId, t, now);
  await forget(`oura:${accountId}:`);
}

export async function ouraConnected(accountId: string): Promise<boolean> {
  return Boolean(await getSecret(accountId, "oura.refreshToken"));
}

/** Forgets the tokens here and asks Oura to revoke the access token (best effort). */
export async function disconnectOura(accountId: string): Promise<void> {
  const held = readTokenSet(await getSecret(accountId, "oura.accessToken"));
  await setSecret(accountId, "oura.accessToken", null);
  await setSecret(accountId, "oura.refreshToken", null);
  await forget(`oura:${accountId}:`);
  if (held) {
    await fetch(`${REVOKE_URL}?${new URLSearchParams({ access_token: held.token })}`, { signal: AbortSignal.timeout(5000) }).catch(
      () => undefined,
    );
  }
}

const refreshing = new Map<string, Promise<string>>();

async function refresh(accountId: string, now: number): Promise<string> {
  const used = await getSecret(accountId, "oura.refreshToken");
  if (!used) throw new OuraDisconnected();
  try {
    return await store(accountId, await tokenRequest({ grant_type: "refresh_token", refresh_token: used }), now);
  } catch (error) {
    if (!(error instanceof OuraDisconnected)) throw error;
    // Another instance may have spent the same refresh token a moment ago and stored the new pair.
    const latest = await getSecret(accountId, "oura.refreshToken");
    const held = readTokenSet(await getSecret(accountId, "oura.accessToken"));
    if (latest && latest !== used && held && held.expiresAt > now) return held.token;
    throw error;
  }
}

/** A working access token: the stored one while it lasts, otherwise one refresh per instance at a time. */
export async function ouraToken(accountId: string, now = Date.now(), force = false): Promise<string> {
  if (!force) {
    const held = readTokenSet(await getSecret(accountId, "oura.accessToken"));
    if (held && held.expiresAt > now) return held.token;
  }
  let flight = refreshing.get(accountId);
  if (!flight) {
    flight = refresh(accountId, now).finally(() => refreshing.delete(accountId));
    refreshing.set(accountId, flight);
  }
  return flight;
}

async function getList(accountId: string, path: string, start: string, end: string): Promise<unknown[]> {
  const url = `${API}/${path}?${new URLSearchParams({ start_date: start, end_date: end })}`;
  const call = async (token: string) => fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
  let r = await call(await ouraToken(accountId));
  // A token Oura no longer takes (revoked on Oura's side, or expired early): refresh once and try again.
  if (r.status === 401) r = await call(await ouraToken(accountId, Date.now(), true));
  if (r.status === 401) throw new OuraDisconnected();
  if (r.status === 403) throw new OuraMembershipNeeded();
  if (!r.ok) throw new Error(`Oura answered ${r.status}`);
  const body = (await r.json()) as { data?: unknown };
  return Array.isArray(body.data) ? body.data : [];
}

// Parsing is lenient: an odd or missing field drops that number, never the whole widget.

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** The newest daily document on or before today that carries a score. */
function latestScored(rows: unknown[], today: string): Record<string, unknown> | undefined {
  let best: Record<string, unknown> | undefined;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (!isDay(r.day) || r.day > today || num(r.score) === undefined) continue;
    if (!best || (r.day as string) > (best.day as string)) best = r;
  }
  return best;
}

/**
 * The night to describe: the main sleep (`long_sleep`) on the day of the sleep score, or, failing that, the longest
 * sleep period of that day. Oura files a night under the day you woke up, as it does the sleep score.
 */
export function pickNight(periods: unknown[], day: string): OuraNight | undefined {
  const sameDay = periods.filter(
    (p): p is Record<string, unknown> =>
      Boolean(p) &&
      typeof p === "object" &&
      (p as Record<string, unknown>).day === day &&
      (p as Record<string, unknown>).type !== "deleted",
  );
  const main = sameDay.filter((p) => p.type === "long_sleep");
  const pool = main.length ? main : sameDay.filter((p) => p.type !== "rest");
  const longest = pool.reduce<Record<string, unknown> | undefined>(
    (a, p) => (!a || (num(p.total_sleep_duration) ?? 0) > (num(a.total_sleep_duration) ?? 0) ? p : a),
    undefined,
  );
  if (!longest) return undefined;
  const asleep = num(longest.total_sleep_duration);
  if (asleep === undefined) return undefined;
  return {
    day,
    asleepSeconds: Math.round(asleep),
    bedtimeStart: str(longest.bedtime_start),
    bedtimeEnd: str(longest.bedtime_end),
    efficiency: num(longest.efficiency),
    averageHrv: num(longest.average_hrv),
    lowestHeartRate: num(longest.lowest_heart_rate),
  };
}

export function summarize(
  today: string,
  lists: { sleep: unknown[]; readiness: unknown[]; activity: unknown[]; periods: unknown[] },
): OuraSummary {
  const out: OuraSummary = {};
  const s = latestScored(lists.sleep, today);
  if (s) out.sleep = { day: s.day as string, score: Math.round(s.score as number) };
  const r = latestScored(lists.readiness, today);
  if (r) {
    out.readiness = { day: r.day as string, score: Math.round(r.score as number) };
    const t = num(r.temperature_deviation);
    if (t !== undefined) out.readiness.temperatureDeviation = Math.round(t * 10) / 10;
  }
  const a = latestScored(lists.activity, today);
  if (a) {
    out.activity = { day: a.day as string, score: Math.round(a.score as number) };
    const steps = num(a.steps);
    if (steps !== undefined) out.activity.steps = Math.round(steps);
  }
  const night = pickNight(lists.periods, out.sleep?.day ?? today);
  if (night) out.night = night;
  return out;
}

/** Today's numbers for one household, shared by every display and widget for 15 minutes. */
export async function ouraFeed(accountId: string, today: string): Promise<OuraData> {
  if (!(await ouraConnected(accountId))) return { updatedAt: Date.now(), connected: false, today };
  // A few days back, so the wall still has last night's numbers before the phone app has synced this morning.
  const start = addDays(today, -3);
  const end = addDays(today, 1);
  const { value, fetchedAt, stale } = await cached(`oura:${accountId}:${today}`, TTL, async () => {
    const [sleep, readiness, activity, periods] = await Promise.all([
      getList(accountId, "daily_sleep", start, end),
      getList(accountId, "daily_readiness", start, end),
      getList(accountId, "daily_activity", start, end),
      getList(accountId, "sleep", start, end),
    ]);
    return summarize(today, { sleep, readiness, activity, periods });
  });
  return { updatedAt: fetchedAt, stale, connected: true, today, ...value };
}
