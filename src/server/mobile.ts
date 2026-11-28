import "server-only";

import { randomToken, sha256 } from "./crypto";
import { query, run } from "./db";

// Phones and tablets running the Everydaypane app (Melvin, 2026-11-27: "a capacitor app that's compatible with iOS
// iPad, Android tablet, with native support"). The app shows the live site, so a signed-in person registers the
// device from the page they're on (their own Clerk session). Registration hands back an app token that only the
// app's native side keeps (iOS App Group, Android private preferences): home-screen widgets and the home geofence
// call our API with it when no web page is open. Only its hash is stored, like display tokens.

export const MOBILE_PLATFORMS = ["ios", "android"] as const;
export type MobilePlatform = (typeof MOBILE_PLATFORMS)[number];

export const PUSH_ENVS = ["production", "sandbox"] as const;
export type PushEnv = (typeof PUSH_ENVS)[number];

/** Devices per household: plenty for a family, and a stop on a runaway registration loop. */
export const MAX_MOBILE_DEVICES = 30;

export interface MobileDevice {
  id: string;
  accountId: string;
  email: string;
  platform: MobilePlatform;
  name: string;
  pushToken: string | null;
  pushEnv: PushEnv;
  notifyMessages: boolean;
  notifyAlerts: boolean;
  sharePresence: boolean;
  presence: "home" | "away" | null;
  presenceAt: number | null;
  createdAt: number;
  lastSeenAt: number;
}

type Row = {
  id: string;
  account_id: string;
  email: string;
  platform: string;
  name: string;
  push_token: string | null;
  push_env: string | null;
  notify_messages: number;
  notify_alerts: number;
  share_presence: number;
  presence: string | null;
  presence_at: number | null;
  created_at: number;
  last_seen_at: number;
};

const COLUMNS =
  "id, account_id, email, platform, name, push_token, push_env, notify_messages, notify_alerts, share_presence, presence, presence_at, created_at, last_seen_at";

function fromRow(r: Row): MobileDevice {
  return {
    id: r.id,
    accountId: r.account_id,
    email: r.email,
    platform: r.platform === "android" ? "android" : "ios",
    name: r.name,
    pushToken: r.push_token,
    pushEnv: r.push_env === "sandbox" ? "sandbox" : "production",
    notifyMessages: Boolean(Number(r.notify_messages)),
    notifyAlerts: Boolean(Number(r.notify_alerts)),
    sharePresence: Boolean(Number(r.share_presence)),
    presence: r.presence === "home" || r.presence === "away" ? r.presence : null,
    presenceAt: r.presence_at === null ? null : Number(r.presence_at),
    createdAt: Number(r.created_at),
    lastSeenAt: Number(r.last_seen_at),
  };
}

export interface Registration {
  platform: MobilePlatform;
  name: string;
  pushToken: string | null;
  pushEnv: PushEnv;
}

export type RegisterResult = { ok: true; device: MobileDevice; appToken: string | null } | { ok: false; error: "full" };

/**
 * Registers this phone for the signed-in person, or updates it when the app already holds a token for one of their
 * devices (the push token changes after a reinstall or an OS update). A fresh app token is only handed out on a new
 * registration; an existing one is never shown again. A push token moves to the newest device that reports it, so a
 * phone that signed in twice never gets a notification twice.
 */
export async function registerMobileDevice(
  session: { accountId: string; email: string },
  input: Registration,
  existingToken: string | null,
  now = Date.now(),
): Promise<RegisterResult> {
  const existing = existingToken ? await deviceByToken(existingToken) : null;
  let device: MobileDevice;
  let appToken: string | null = null;
  if (existing && existing.accountId === session.accountId && existing.email === session.email) {
    await run("UPDATE mobile_devices SET platform = ?, name = ?, push_token = ?, push_env = ?, last_seen_at = ? WHERE id = ?", [
      input.platform,
      input.name,
      input.pushToken,
      input.pushEnv,
      now,
      existing.id,
    ]);
    device = {
      ...existing,
      platform: input.platform,
      name: input.name,
      pushToken: input.pushToken,
      pushEnv: input.pushEnv,
      lastSeenAt: now,
    };
  } else {
    // Someone else signed in on this phone: the old registration goes, so it stops getting their household's pushes.
    if (existing) await run("DELETE FROM mobile_devices WHERE id = ?", [existing.id]);
    const count = await query<{ n: number }>("SELECT COUNT(*) AS n FROM mobile_devices WHERE account_id = ?", [session.accountId]);
    if (Number(count[0]?.n ?? 0) >= MAX_MOBILE_DEVICES) return { ok: false, error: "full" };
    appToken = randomToken(32);
    const id = `mob_${randomToken(9)}`;
    await run(
      `INSERT INTO mobile_devices (id, account_id, email, platform, name, token_hash, push_token, push_env, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, session.accountId, session.email, input.platform, input.name, sha256(appToken), input.pushToken, input.pushEnv, now, now],
    );
    device = {
      id,
      accountId: session.accountId,
      email: session.email,
      platform: input.platform,
      name: input.name,
      pushToken: input.pushToken,
      pushEnv: input.pushEnv,
      notifyMessages: true,
      notifyAlerts: true,
      sharePresence: false,
      presence: null,
      presenceAt: null,
      createdAt: now,
      lastSeenAt: now,
    };
  }
  if (input.pushToken)
    await run("UPDATE mobile_devices SET push_token = NULL WHERE push_token = ? AND id <> ?", [input.pushToken, device.id]);
  return { ok: true, device, appToken };
}

/** The device an app token belongs to (widgets, geofence), touching its last-seen time at most once a minute. */
export async function deviceByToken(token: string, now = Date.now()): Promise<MobileDevice | null> {
  if (!token || token.length > 200) return null;
  const rows = await query<Row>(`SELECT ${COLUMNS} FROM mobile_devices WHERE token_hash = ?`, [sha256(token)]);
  const row = rows[0];
  if (!row) return null;
  if (now - Number(row.last_seen_at) > 60_000) await run("UPDATE mobile_devices SET last_seen_at = ? WHERE id = ?", [now, row.id]);
  return fromRow(row);
}

/** The app token from `Authorization: Bearer …`. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/.exec(header.trim());
  return m?.[1] ?? null;
}

export async function deviceForRequest(req: Request): Promise<MobileDevice | null> {
  const token = bearerToken(req);
  return token ? deviceByToken(token) : null;
}

export async function mobileDevice(accountId: string, id: string): Promise<MobileDevice | null> {
  const rows = await query<Row>(`SELECT ${COLUMNS} FROM mobile_devices WHERE account_id = ? AND id = ?`, [accountId, id]);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function listMobileDevices(accountId: string): Promise<MobileDevice[]> {
  const rows = await query<Row>(`SELECT ${COLUMNS} FROM mobile_devices WHERE account_id = ? ORDER BY created_at`, [accountId]);
  return rows.map(fromRow);
}

export interface MobilePrefs {
  notifyMessages?: boolean;
  notifyAlerts?: boolean;
  sharePresence?: boolean;
}

export async function updateMobilePrefs(accountId: string, id: string, prefs: MobilePrefs): Promise<MobileDevice | null> {
  const device = await mobileDevice(accountId, id);
  if (!device) return null;
  const next = {
    notifyMessages: prefs.notifyMessages ?? device.notifyMessages,
    notifyAlerts: prefs.notifyAlerts ?? device.notifyAlerts,
    sharePresence: prefs.sharePresence ?? device.sharePresence,
  };
  // Turning presence sharing off forgets where the phone last was.
  const clearPresence = !next.sharePresence;
  await run(
    `UPDATE mobile_devices SET notify_messages = ?, notify_alerts = ?, share_presence = ?${clearPresence ? ", presence = NULL, presence_at = NULL" : ""} WHERE id = ?`,
    [Number(next.notifyMessages), Number(next.notifyAlerts), Number(next.sharePresence), id],
  );
  return { ...device, ...next, ...(clearPresence ? { presence: null, presenceAt: null } : {}) };
}

/** Signs a phone out of the app: its widgets and geofence stop working and it gets no more pushes. */
export async function removeMobileDevice(accountId: string, id: string): Promise<boolean> {
  return (await run("DELETE FROM mobile_devices WHERE account_id = ? AND id = ?", [accountId, id])) > 0;
}

/** Whether the phone is home, from the app's home geofence. Ignored unless the person switched sharing on. */
export async function setPresence(device: MobileDevice, state: "home" | "away", now = Date.now()): Promise<boolean> {
  if (!device.sharePresence) return false;
  await run("UPDATE mobile_devices SET presence = ?, presence_at = ? WHERE id = ?", [state, now, device.id]);
  return true;
}

/** Forgets a push token APNs or FCM called dead, so we stop sending to it. */
export async function dropPushToken(token: string): Promise<void> {
  await run("UPDATE mobile_devices SET push_token = NULL WHERE push_token = ?", [token]);
}

/** What the page shows about this phone. Never the app token or the push token. */
export const publicDevice = (d: MobileDevice) => ({
  id: d.id,
  platform: d.platform,
  name: d.name,
  push: Boolean(d.pushToken),
  notifyMessages: d.notifyMessages,
  notifyAlerts: d.notifyAlerts,
  sharePresence: d.sharePresence,
  presence: d.presence,
  presenceAt: d.presenceAt,
});
