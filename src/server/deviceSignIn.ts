import "server-only";

import { randomBytes } from "node:crypto";

import { DEVICE_CODE_ALPHABET, DEVICE_CODE_LENGTH, formatDeviceCode, normalizeDeviceCode, phoneSignInPath } from "@/lib/deviceSignIn";

import { accountsForEmail, type MemberRole } from "./accounts";
import { sessionCookie } from "./auth";
import { decrypt, encrypt, randomToken, sha256 } from "./crypto";
import { query, rateLimit, run } from "./db";
import { env } from "./env";
import { clientIp, json } from "./http";
import { qrSvg } from "./wifi";

export { formatDeviceCode, normalizeDeviceCode, phoneSignInPath };

// Sign in on a display from a phone (Melvin, 2026-11-23): the display shows a QR + short code; the phone signs in
// (magic link works there) and approves; the display polls and claims a one-time handoff for its session cookie.
// Same idea as Tuned's TV account pairing — no sealed playlist payload, just a short-lived code relay in Turso.

export const DEVICE_SIGN_IN_MS = 10 * 60_000;

export type DevicePollStatus = "pending" | "ready" | "expired" | "claimed";

function newCode(): string {
  // Unbiased pick: reject bytes past the last full run of the alphabet (same idea as Tuned's newCode).
  const limit = 256 - (256 % DEVICE_CODE_ALPHABET.length);
  let code = "";
  while (code.length < DEVICE_CODE_LENGTH) {
    for (const byte of randomBytes(16)) {
      if (byte < limit && code.length < DEVICE_CODE_LENGTH) code += DEVICE_CODE_ALPHABET[byte % DEVICE_CODE_ALPHABET.length]!;
    }
  }
  return code;
}

export function phoneSignInUrl(code: string, origin: string): string {
  const base = (env.siteUrl() || origin).replace(/\/$/, "");
  return `${base}${phoneSignInPath(code)}`;
}

async function purgeExpired(now: number): Promise<void> {
  await run("DELETE FROM device_sign_ins WHERE expires_at < ?", [now - 86_400_000]);
}

/** Display starts a code session and shows the QR. */
export async function startDeviceSignIn(req: Request, origin: string, now = Date.now()): Promise<Response> {
  if (!(await rateLimit(`device-signin-start:${clientIp(req)}`, 20, 15 * 60_000, now))) {
    return json({ error: "Too many tries. Wait 15 minutes." }, 429);
  }
  await purgeExpired(now);
  const pollSecret = randomToken();
  const pollSecretHash = sha256(pollSecret);
  for (let tryN = 0; tryN < 8; tryN++) {
    const code = newCode();
    try {
      await run("INSERT INTO device_sign_ins (code_hash, poll_secret_hash, expires_at) VALUES (?, ?, ?)", [
        sha256(code),
        pollSecretHash,
        now + DEVICE_SIGN_IN_MS,
      ]);
    } catch {
      continue;
    }
    const url = phoneSignInUrl(code, origin);
    return json({
      ok: true,
      code: formatDeviceCode(code),
      pollSecret,
      expiresAt: now + DEVICE_SIGN_IN_MS,
      phoneUrl: url,
      qrSvg: qrSvg(url),
    });
  }
  return json({ error: "Couldn't start phone sign-in. Try again." }, 503);
}

/** Phone (already signed in) approves the display's code. */
export async function approveDeviceSignIn(
  req: Request,
  session: { email: string; accountId: string; role: MemberRole },
  rawCode: string,
  now = Date.now(),
): Promise<Response> {
  if (!(await rateLimit(`device-signin-approve:${clientIp(req)}`, 30, 60 * 60_000, now))) {
    return json({ error: "Too many tries. Wait an hour." }, 429);
  }
  const code = normalizeDeviceCode(rawCode);
  if (!code) return json({ error: "That code isn't valid. Check the display and try again." }, 400);
  const rows = await query<{
    expires_at: number;
    approved_at: number | null;
    claimed_at: number | null;
    handoff_hash: string | null;
  }>("SELECT expires_at, approved_at, claimed_at, handoff_hash FROM device_sign_ins WHERE code_hash = ?", [sha256(code)]);
  const row = rows[0];
  if (!row) return json({ error: "That code wasn't found. Ask the display for a new one." }, 404);
  if (Number(row.expires_at) <= now) return json({ error: "That code has expired. Ask the display for a new one." }, 410);
  if (row.claimed_at != null) return json({ error: "That display already signed in." }, 409);
  if (row.approved_at != null && row.handoff_hash) {
    return json({ ok: true, message: "Already approved. The display should finish signing in." });
  }

  const members = await accountsForEmail(session.email);
  if (!members.some((m) => m.accountId === session.accountId)) {
    return json({ error: "Your sign-in isn't valid any more." }, 401);
  }

  const handoff = randomToken();
  const updated = await query<{ handoff_hash: string | null }>(
    `UPDATE device_sign_ins
     SET email = ?, account_id = ?, handoff_hash = ?, handoff_sealed = ?, approved_at = ?, role = ?
     WHERE code_hash = ? AND approved_at IS NULL AND claimed_at IS NULL AND expires_at > ?
     RETURNING handoff_hash`,
    [session.email, session.accountId, sha256(handoff), encrypt(handoff), now, session.role, sha256(code), now],
  );
  if (!updated[0]) {
    return json({ ok: true, message: "Already approved. The display should finish signing in." });
  }
  return json({ ok: true, message: "Approved. This display is signing in now." });
}

/** Display polls with its poll secret until the phone approves. */
export async function pollDeviceSignIn(req: Request, rawCode: string, pollSecret: string, now = Date.now()): Promise<Response> {
  if (!(await rateLimit(`device-signin-poll:${clientIp(req)}`, 120, 15 * 60_000, now))) {
    return json({ error: "Too many polls. Wait a bit." }, 429);
  }
  const code = normalizeDeviceCode(rawCode);
  if (!code || !pollSecret || pollSecret.length < 20) return json({ status: "expired" as DevicePollStatus });
  const rows = await query<{
    poll_secret_hash: string;
    expires_at: number;
    approved_at: number | null;
    claimed_at: number | null;
    email: string | null;
    role: string | null;
    handoff_sealed: string | null;
  }>("SELECT poll_secret_hash, expires_at, approved_at, claimed_at, email, role, handoff_sealed FROM device_sign_ins WHERE code_hash = ?", [
    sha256(code),
  ]);
  const row = rows[0];
  if (!row || row.poll_secret_hash !== sha256(pollSecret)) return json({ status: "expired" as DevicePollStatus });
  if (row.claimed_at != null) return json({ status: "claimed" as DevicePollStatus });
  if (Number(row.expires_at) <= now) return json({ status: "expired" as DevicePollStatus });
  if (row.approved_at == null || !row.handoff_sealed) return json({ status: "pending" as DevicePollStatus });

  const handoff = decrypt(row.handoff_sealed);
  if (!handoff) return json({ status: "expired" as DevicePollStatus });
  // Clear the sealed copy so a later poll doesn't keep re-issuing; claim still uses handoff_hash once.
  await run("UPDATE device_sign_ins SET handoff_sealed = NULL WHERE code_hash = ? AND handoff_sealed IS NOT NULL", [sha256(code)]);
  return json({
    status: "ready" as DevicePollStatus,
    handoff,
    email: row.email,
    role: row.role,
  });
}

/** Display exchanges the one-time handoff for a session cookie. */
export async function claimDeviceSignIn(req: Request, handoff: string, now = Date.now()): Promise<Response> {
  if (!(await rateLimit(`device-signin-claim:${clientIp(req)}`, 30, 15 * 60_000, now))) {
    return json({ error: "Too many tries. Wait 15 minutes." }, 429);
  }
  if (!handoff || handoff.length < 20) return json({ error: "That sign-in isn't valid." }, 400);
  const h = sha256(handoff);
  const rows = await query<{
    email: string | null;
    account_id: string | null;
    expires_at: number;
    claimed_at: number | null;
  }>("SELECT email, account_id, expires_at, claimed_at FROM device_sign_ins WHERE handoff_hash = ?", [h]);
  const row = rows[0];
  if (!row?.email || !row.account_id) return json({ error: "That sign-in isn't valid." }, 410);
  if (row.claimed_at != null) return json({ error: "That sign-in was already used." }, 410);
  if (Number(row.expires_at) <= now) return json({ error: "That sign-in has expired." }, 410);

  const members = await accountsForEmail(row.email);
  const membership = members.find((m) => m.accountId === row.account_id);
  if (!membership) return json({ error: "That sign-in isn't valid any more." }, 410);

  const used = await query<{ claimed_at: number | null }>(
    "UPDATE device_sign_ins SET claimed_at = ? WHERE handoff_hash = ? AND claimed_at IS NULL AND expires_at > ? RETURNING claimed_at",
    [now, h, now],
  );
  if (!used[0]) return json({ error: "That sign-in was already used." }, 410);

  const sessionToken = randomToken();
  await run("INSERT INTO sessions (token_hash, email, account_id, created_at, last_used_at) VALUES (?, ?, ?, ?, ?)", [
    sha256(sessionToken),
    row.email,
    row.account_id,
    now,
    now,
  ]);

  return json({ ok: true, role: membership.role, email: row.email }, 200, { "Set-Cookie": sessionCookie(sessionToken) });
}
