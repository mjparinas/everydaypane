import "server-only";

import { createHmac } from "node:crypto";

import { readCookie } from "./auth";
import { safeEqual, sha256 } from "./crypto";
import { deviceForTokenHash, type Device } from "./devices";
import { env } from "./env";

// Short-lived display cookie for image routes (photos, cameras, radar, QR, art). `<img>` can't send
// `x-display-token`, and putting the long-lived device token in `?t=` lands it in CDN and access logs.
// The cookie is HttpOnly, SameSite=Strict, Path=/api/display/, and holds only the token's hash plus an expiry.

export const DISPLAY_COOKIE = "ep_display";
/** A week: the kitchen display reloads overnight, which refreshes it. */
export const DISPLAY_COOKIE_MS = 7 * 86_400_000;

function signingKey(): Buffer {
  const secret = env.sessionSecret();
  if (secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return createHmac("sha256", secret).update("display-cookie").digest();
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

/** Builds the cookie value for a raw display token (set when `/d/<token>/` is opened). */
export function sealDisplayCookie(token: string, now = Date.now()): string {
  const exp = now + DISPLAY_COOKIE_MS;
  const payload = `v1.${sha256(token)}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function displayCookieHeader(token: string, now = Date.now()): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${DISPLAY_COOKIE}=${sealDisplayCookie(token, now)}; Path=/api/display/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(DISPLAY_COOKIE_MS / 1000)}${secure}`;
}

/** The device for a valid, unexpired display cookie, or null. */
export async function deviceFromDisplayCookie(cookieValue: string | undefined, now = Date.now()): Promise<Device | null> {
  if (!cookieValue) return null;
  const parts = cookieValue.split(".");
  // v1.<64-hex-hash>.<exp>.<sig>
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [, hash, expRaw, sig] = parts;
  if (!hash || !expRaw || !sig || !/^[a-f0-9]{64}$/.test(hash)) return null;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < now) return null;
  const payload = `v1.${hash}.${expRaw}`;
  if (!safeEqual(sign(payload), sig)) return null;
  return deviceForTokenHash(hash, now);
}

export const displayCookieFromRequest = (req: Request, now = Date.now()) => deviceFromDisplayCookie(readCookie(req, DISPLAY_COOKIE), now);
