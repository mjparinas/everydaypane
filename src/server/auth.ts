import "server-only";

import { randomToken, sha256 } from "./crypto";
import { query, rateLimit, run } from "./db";
import { env } from "./env";
import { clientIp, json } from "./http";
import { sendEmail } from "./mail";

// Sign-in by magic link (Melvin, 2026-11-17), as Liftsmith's admin panel does it: a one-time link emailed through
// Resend to an address on ADMIN_EMAILS (changes the dashboard) or FAMILY_EMAILS (posts on the message board only).
// The lists live in the environment, so nothing a request writes can make someone an admin. Only hashes of links
// and session tokens are stored. The emailed link opens a page with a button, and only the button's POST uses the
// link up, so mail scanners that open links don't sign anyone in or burn the link.

export const SESSION_COOKIE = "ep_session";
export const LINK_MS = 15 * 60_000;
/** A session ends after 30 days without use, and 180 days after sign-in regardless. */
export const IDLE_MS = 30 * 86_400_000;
export const MAX_MS = 180 * 86_400_000;
const RENEW_MS = 86_400_000;

export type Role = "admin" | "family";
export interface Session {
  email: string;
  role: Role;
}

export function roleOf(email: string): Role | null {
  const e = email.trim().toLowerCase();
  if (env.adminEmails().has(e)) return "admin";
  if (env.familyEmails().has(e)) return "family";
  return null;
}

const SENT = { ok: true, message: "If that address can sign in, a link is on its way. It works once, for 15 minutes." };

/** Emails a sign-in link if the address is on a list. Always answers the same, so the lists can't be probed. */
export async function startSignIn(req: Request, email: string, origin: string, now = Date.now()): Promise<Response> {
  const e = email.trim().toLowerCase();
  if (!(await rateLimit(`sign-in:${clientIp(req)}`, 10, 15 * 60_000, now))) return json({ error: "Too many tries. Wait 15 minutes." }, 429);
  if (!(await rateLimit(`sign-in-email:${e}`, 5, 15 * 60_000, now))) return json(SENT);
  if (!roleOf(e)) return json(SENT);
  const token = randomToken();
  await run("INSERT INTO sign_in_links (token_hash, email, expires_at) VALUES (?, ?, ?)", [sha256(token), e, now + LINK_MS]);
  const link = `${env.siteUrl() || origin}/signin/verify/?token=${encodeURIComponent(token)}`;
  const sent = await sendEmail({
    to: e,
    subject: "Your Everydaypane sign-in link",
    text: `Open this link to sign in to Everydaypane:\n\n${link}\n\nIt works once, for 15 minutes. If you didn't ask for it, ignore this email.`,
    html: signInHtml(link),
  });
  if (!sent) return json({ error: "The email couldn't be sent. Try again in a minute." }, 502);
  return json(SENT);
}

/** Uses up a link (one statement, so two racing requests can't both win) and starts a session. */
export async function finishSignIn(token: string, now = Date.now()): Promise<{ sessionToken: string; session: Session } | null> {
  const rows = await query<{ email: string }>(
    "UPDATE sign_in_links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING email",
    [now, sha256(token), now],
  );
  const email = rows[0]?.email;
  if (!email) return null;
  const role = roleOf(email);
  if (!role) return null;
  const sessionToken = randomToken();
  await run("INSERT INTO sessions (token_hash, email, created_at, last_used_at) VALUES (?, ?, ?, ?)", [
    sha256(sessionToken),
    email,
    now,
    now,
  ]);
  await run("DELETE FROM sign_in_links WHERE expires_at < ?", [now - 86_400_000]);
  return { sessionToken, session: { email, role } };
}

/** The session for a cookie value. The role is read from the environment each time, so removing an address signs it out. */
export async function sessionFor(cookieValue: string | undefined, now = Date.now()): Promise<Session | null> {
  if (!cookieValue) return null;
  const h = sha256(cookieValue);
  const rows = await query<{ email: string; created_at: number; last_used_at: number }>(
    "SELECT email, created_at, last_used_at FROM sessions WHERE token_hash = ?",
    [h],
  );
  const row = rows[0];
  if (!row) return null;
  if (now - Number(row.last_used_at) > IDLE_MS || now - Number(row.created_at) > MAX_MS) {
    await run("DELETE FROM sessions WHERE token_hash = ?", [h]);
    return null;
  }
  const role = roleOf(row.email);
  if (!role) return null;
  if (now - Number(row.last_used_at) > RENEW_MS) await run("UPDATE sessions SET last_used_at = ? WHERE token_hash = ?", [now, h]);
  return { email: row.email, role };
}

export async function endSession(cookieValue: string | undefined): Promise<void> {
  if (cookieValue) await run("DELETE FROM sessions WHERE token_hash = ?", [sha256(cookieValue)]);
}

export function sessionCookie(value: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(MAX_MS / 1000)}${secure}`;
}

export const clearedSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

export const requestSession = (req: Request) => sessionFor(readCookie(req, SESSION_COOKIE));

function signInHtml(link: string): string {
  const safe = link.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#0f172a">
<h1 style="font-size:20px">Sign in to Everydaypane</h1>
<p>Tap the button to sign in. The link works once, for 15 minutes.</p>
<p><a href="${safe}" style="display:inline-block;background:#3b5bdb;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Sign in</a></p>
<p style="color:#526077;font-size:13px">If you didn't ask for this, ignore this email.</p></div>`;
}
