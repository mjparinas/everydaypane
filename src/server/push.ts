import "server-only";

import { connect } from "node:http2";

import { importPKCS8, SignJWT } from "jose";
import { after } from "next/server";

import { meetsBanner } from "@/lib/alerts";
import type { DashboardConfig } from "@/lib/config/schema";
import type { EmergencyAlert } from "@/lib/display/types";

import { query, run } from "./db";
import { dropPushToken, listMobileDevices, type MobileDevice } from "./mobile";

// Push notifications for the Everydaypane app (Melvin, 2026-11-27). iOS goes straight to Apple's APNs with a token
// key (.p8), so the iPhone app needs no Firebase SDK; Android goes through Firebase Cloud Messaging's HTTP v1 API with
// a service account. Both are Everydaypane's own keys in Vercel (PLATFORM_KEYS "apns" and "fcm"); without them
// nothing is sent and nothing fails. Two things push today: a new message board note (to everyone else in the
// household) and a new alert worth the strip, or a washer or dryer finishing.

export interface PushMessage {
  title: string;
  body: string;
  /** A path on our own site the app opens when the notification is tapped. */
  url: string;
  /** Groups notifications on iOS and picks the Android channel. */
  kind: "messages" | "alerts";
}

const apnsConfig = () => {
  const keyId = process.env.APNS_KEY_ID?.trim() ?? "";
  const teamId = process.env.APNS_TEAM_ID?.trim() ?? "";
  // Vercel keeps newlines in a pasted .p8; a one-line copy with literal \n works too.
  const key = (process.env.APNS_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").trim();
  const topic = process.env.APNS_BUNDLE_ID?.trim() || "com.everydaypane.app";
  return keyId && teamId && key ? { keyId, teamId, key, topic } : null;
};

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

/** FCM_SERVICE_ACCOUNT holds the downloaded JSON key, either as is or base64 encoded. */
export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  const text = raw?.trim();
  if (!text) return null;
  const tryParse = (s: string) => {
    try {
      const v = JSON.parse(s) as Partial<ServiceAccount>;
      return v.project_id && v.client_email && v.private_key ? (v as ServiceAccount) : null;
    } catch {
      return null;
    }
  };
  return tryParse(text) ?? tryParse(Buffer.from(text, "base64").toString("utf8"));
}

export const pushConfigured = () => ({ apns: Boolean(apnsConfig()), fcm: Boolean(parseServiceAccount(process.env.FCM_SERVICE_ACCOUNT)) });

// ---- APNs -------------------------------------------------------------------------------------------------------

let apnsJwt: { token: string; at: number; keyId: string } | null = null;

/** Apple wants the provider token refreshed between 20 and 60 minutes; we make a new one every 40. */
async function apnsToken(cfg: NonNullable<ReturnType<typeof apnsConfig>>, now = Date.now()): Promise<string> {
  if (apnsJwt && apnsJwt.keyId === cfg.keyId && now - apnsJwt.at < 40 * 60_000) return apnsJwt.token;
  const key = await importPKCS8(cfg.key, "ES256");
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: cfg.keyId })
    .setIssuer(cfg.teamId)
    .setIssuedAt(Math.floor(now / 1000))
    .sign(key);
  apnsJwt = { token, at: now, keyId: cfg.keyId };
  return token;
}

export function apnsPayload(m: PushMessage): string {
  return JSON.stringify({ aps: { alert: { title: m.title, body: m.body }, sound: "default", "thread-id": m.kind }, url: m.url, kind: m.kind });
}

type SendOutcome = "sent" | "dead" | "failed";

function sendApns(host: string, token: string, jwt: string, topic: string, body: string): Promise<{ status: number; reason: string }> {
  return new Promise((resolve) => {
    const client = connect(`https://${host}`);
    const done = (status: number, reason: string) => {
      client.close();
      resolve({ status, reason });
    };
    client.on("error", (e) => done(0, String(e)));
    client.setTimeout(10_000, () => done(0, "timeout"));
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });
    let status = 0;
    let text = "";
    req.on("response", (h) => (status = Number(h[":status"] ?? 0)));
    req.setEncoding("utf8");
    req.on("data", (c: string) => (text += c));
    req.on("end", () => {
      let reason = "";
      try {
        reason = (JSON.parse(text || "{}") as { reason?: string }).reason ?? "";
      } catch {
        reason = text.slice(0, 80);
      }
      done(status, reason);
    });
    req.on("error", (e) => done(0, String(e)));
    req.end(body);
  });
}

/** APNs answers 410 Unregistered or 400 BadDeviceToken for a token that will never work again. */
export const apnsDead = (status: number, reason: string) =>
  status === 410 || (status === 400 && /BadDeviceToken|DeviceTokenNotForTopic/.test(reason));

async function toApns(device: MobileDevice, m: PushMessage): Promise<SendOutcome> {
  const cfg = apnsConfig();
  if (!cfg || !device.pushToken) return "failed";
  const host = device.pushEnv === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  const { status, reason } = await sendApns(host, device.pushToken, await apnsToken(cfg), cfg.topic, apnsPayload(m));
  if (status === 200) return "sent";
  if (apnsDead(status, reason)) return "dead";
  console.error("[push] APNs refused", status, reason);
  return "failed";
}

// ---- FCM --------------------------------------------------------------------------------------------------------

let fcmAccess: { token: string; until: number; email: string } | null = null;

async function fcmAccessToken(sa: ServiceAccount, now = Date.now()): Promise<string | null> {
  if (fcmAccess && fcmAccess.email === sa.client_email && now < fcmAccess.until) return fcmAccess.token;
  const key = await importPKCS8(sa.private_key, "RS256");
  const iat = Math.floor(now / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(iat)
    .setExpirationTime(iat + 3600)
    .sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    console.error("[push] Google refused the FCM service account", res.status);
    return null;
  }
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) return null;
  fcmAccess = { token: body.access_token, until: now + Math.max(60, (body.expires_in ?? 3600) - 300) * 1000, email: sa.client_email };
  return fcmAccess.token;
}

export function fcmBody(token: string, m: PushMessage) {
  return {
    message: {
      token,
      notification: { title: m.title, body: m.body },
      data: { url: m.url, kind: m.kind },
      android: { priority: "high", notification: { channel_id: m.kind } },
    },
  };
}

async function toFcm(device: MobileDevice, m: PushMessage): Promise<SendOutcome> {
  const sa = parseServiceAccount(process.env.FCM_SERVICE_ACCOUNT);
  if (!sa || !device.pushToken) return "failed";
  const access = await fcmAccessToken(sa);
  if (!access) return "failed";
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
    body: JSON.stringify(fcmBody(device.pushToken, m)),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.ok) return "sent";
  const text = await res.text().catch(() => "");
  if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT.*registration/i.test(text)) return "dead";
  console.error("[push] FCM refused", res.status, text.slice(0, 200));
  return "failed";
}

/**
 * Runs a push after the response is sent (Vercel keeps the function alive for it). Outside a request, as in unit
 * tests, it just runs.
 */
export function pushLater(task: () => Promise<unknown>): void {
  const safe = () => task().catch((error: unknown) => console.error("[push] failed", error));
  try {
    after(safe);
  } catch {
    void safe();
  }
}

// ---- Sending ----------------------------------------------------------------------------------------------------

/** Sends one notification to each device; dead tokens are forgotten. Answers how many went out. */
export async function pushTo(devices: MobileDevice[], m: PushMessage): Promise<number> {
  const results = await Promise.all(
    devices
      .filter((d) => d.pushToken)
      .map(async (d) => {
        try {
          const outcome = d.platform === "ios" ? await toApns(d, m) : await toFcm(d, m);
          if (outcome === "dead" && d.pushToken) await dropPushToken(d.pushToken);
          return outcome === "sent";
        } catch (e) {
          console.error("[push] send failed", e);
          return false;
        }
      }),
  );
  return results.filter(Boolean).length;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A new message board note, to everyone in the household who wants them except whoever posted it. */
export async function pushNewMessage(accountId: string, note: { author: string; text: string; postedBy: string }): Promise<number> {
  const { apns, fcm } = pushConfigured();
  if (!apns && !fcm) return 0;
  const devices = (await listMobileDevices(accountId)).filter((d) => d.notifyMessages && d.email !== note.postedBy);
  if (!devices.length) return 0;
  return pushTo(devices, { title: clip(note.author, 40), body: clip(note.text, 180), url: "/family/", kind: "messages" });
}

/** Claims a push for one occurrence, so two walls reading alerts at the same moment push it once. */
async function claim(accountId: string, key: string, now: number): Promise<boolean> {
  return (await run("INSERT OR IGNORE INTO push_sent (account_id, key, sent_at) VALUES (?, ?, ?)", [accountId, key, now])) > 0;
}

/** Which alerts are worth a push: what earns the strip (never household smart notices), plus a washer or dryer done. */
export function pushWorthy(alerts: EmergencyAlert[], config: DashboardConfig): EmergencyAlert[] {
  if (!config.alerts.enabled) return [];
  return alerts.filter((a) => (a.notice ? a.source === "laundry" : meetsBanner(a.severity, config.alerts.banner)));
}

/** Pushes any alert the household hasn't been told about yet. Old claims are cleared after 30 days. */
export async function pushNewAlerts(accountId: string, config: DashboardConfig, alerts: EmergencyAlert[], now = Date.now()): Promise<number> {
  const { apns, fcm } = pushConfigured();
  if (!apns && !fcm) return 0;
  // Only fresh ones: a phone that registers today shouldn't buzz for a warning issued yesterday.
  const worthy = pushWorthy(alerts, config).filter((a) => now - a.sent < 6 * 3_600_000);
  if (!worthy.length) return 0;
  const devices = (await listMobileDevices(accountId)).filter((d) => d.notifyAlerts && d.pushToken);
  if (!devices.length) return 0;
  let sent = 0;
  for (const a of worthy) {
    if (!(await claim(accountId, `alert:${a.id}:${a.sent}`, now))) continue;
    sent += await pushTo(devices, { title: clip(a.title, 80), body: clip(a.area || a.description, 180), url: "/family/", kind: "alerts" });
  }
  await run("DELETE FROM push_sent WHERE account_id = ? AND sent_at < ?", [accountId, now - 30 * 86_400_000]);
  return sent;
}

/** Tests only. */
export async function pushClaims(accountId: string): Promise<string[]> {
  return (await query<{ key: string }>("SELECT key FROM push_sent WHERE account_id = ?", [accountId])).map((r) => r.key);
}
