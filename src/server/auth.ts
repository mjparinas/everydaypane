import "server-only";

import { signInEmail } from "@/lib/email";
import { safeNext } from "@/lib/safeNext";

import { accountsForEmail, canSignIn, createAccount, ensureAccountsSeeded, type MemberRole } from "./accounts";
import { randomToken, sha256 } from "./crypto";
import { query, rateLimit, run } from "./db";
import { env } from "./env";
import { clientIp, json } from "./http";
import { sendEmail } from "./mail";

// Sign-in by magic link (Melvin, 2026-11-17), extended for multi-tenant accounts (2026-11-22): members of a household
// or a new signup. Env ADMIN_EMAILS / FAMILY_EMAILS still open the grandfather household. Only hashes of links and
// session tokens are stored. The emailed link opens a page with a button, and only the button's POST uses the link up.

export const SESSION_COOKIE = "ep_session";
export const LINK_MS = 15 * 60_000;
export const IDLE_MS = 30 * 86_400_000;
export const MAX_MS = 180 * 86_400_000;
const RENEW_MS = 86_400_000;

export type Role = MemberRole;
export interface Session {
  email: string;
  role: Role;
  accountId: string;
}

const SENT = { ok: true, message: "If that address can sign in, a link is on its way. It works once, for 15 minutes." };

/** Emails a sign-in link if the address belongs to a household (or env bootstrap). Always answers the same. */
export async function startSignIn(req: Request, email: string, origin: string, now = Date.now(), next?: string | null): Promise<Response> {
  await ensureAccountsSeeded(now);
  const e = email.trim().toLowerCase();
  if (!(await rateLimit(`sign-in:${clientIp(req)}`, 10, 15 * 60_000, now))) return json({ error: "Too many tries. Wait 15 minutes." }, 429);
  if (!(await rateLimit(`sign-in-email:${e}`, 5, 15 * 60_000, now))) return json(SENT);
  if (!(await canSignIn(e))) return json(SENT);
  const members = await accountsForEmail(e);
  const accountId = members[0]?.accountId;
  if (!accountId) return json(SENT);
  const token = randomToken();
  await run("INSERT INTO sign_in_links (token_hash, email, account_id, expires_at) VALUES (?, ?, ?, ?)", [
    sha256(token),
    e,
    accountId,
    now + LINK_MS,
  ]);
  // Bake `next` into the emailed URL so phone unlock still returns to Approve when the mail app opens a
  // different browser than the one that stored sessionStorage (Melvin, 2026-11-24).
  const after = safeNext(next);
  const link = `${env.siteUrl() || origin}/signin/verify/?token=${encodeURIComponent(token)}${
    after ? `&next=${encodeURIComponent(after)}` : ""
  }`;
  const sent = await sendEmail({ to: e, ...signInEmail(link) });
  if (!sent) return json({ error: "The email couldn't be sent. Try again in a minute." }, 502);
  return json(SENT);
}

/**
 * Starts a Free household for a new address and emails a sign-in link. Existing members get a normal link instead.
 */
export async function startSignUp(
  req: Request,
  email: string,
  name: string,
  origin: string,
  now = Date.now(),
  next?: string | null,
): Promise<Response> {
  await ensureAccountsSeeded(now);
  const e = email.trim().toLowerCase();
  if (!(await rateLimit(`sign-up:${clientIp(req)}`, 5, 15 * 60_000, now))) return json({ error: "Too many tries. Wait 15 minutes." }, 429);
  if (!(await rateLimit(`sign-up-email:${e}`, 3, 60 * 60_000, now))) return json(SENT);
  if (!e.includes("@")) return json(SENT);
  if (await canSignIn(e)) return startSignIn(req, e, origin, now, next);
  await createAccount(name || "Home", e, now);
  return startSignIn(req, e, origin, now, next);
}

/** Uses up a link (one statement, so two racing requests can't both win) and starts a session. */
export async function finishSignIn(token: string, now = Date.now()): Promise<{ sessionToken: string; session: Session } | null> {
  await ensureAccountsSeeded(now);
  const rows = await query<{ email: string; account_id: string | null }>(
    "UPDATE sign_in_links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING email, account_id",
    [now, sha256(token), now],
  );
  const row = rows[0];
  if (!row?.email) return null;
  const members = await accountsForEmail(row.email);
  const accountId = row.account_id && members.some((m) => m.accountId === row.account_id) ? row.account_id : members[0]?.accountId;
  const membership = members.find((m) => m.accountId === accountId);
  if (!accountId || !membership) return null;
  const sessionToken = randomToken();
  await run("INSERT INTO sessions (token_hash, email, account_id, created_at, last_used_at) VALUES (?, ?, ?, ?, ?)", [
    sha256(sessionToken),
    row.email,
    accountId,
    now,
    now,
  ]);
  await run("DELETE FROM sign_in_links WHERE expires_at < ?", [now - 86_400_000]);
  return { sessionToken, session: { email: row.email, role: membership.role, accountId } };
}

/** The session for a cookie value. Membership is re-read each time so removing someone signs them out. */
export async function sessionFor(cookieValue: string | undefined, now = Date.now()): Promise<Session | null> {
  if (!cookieValue) return null;
  await ensureAccountsSeeded(now);
  const h = sha256(cookieValue);
  const rows = await query<{ email: string; account_id: string | null; created_at: number; last_used_at: number }>(
    "SELECT email, account_id, created_at, last_used_at FROM sessions WHERE token_hash = ?",
    [h],
  );
  const row = rows[0];
  if (!row) return null;
  if (now - Number(row.last_used_at) > IDLE_MS || now - Number(row.created_at) > MAX_MS) {
    await run("DELETE FROM sessions WHERE token_hash = ?", [h]);
    return null;
  }
  const members = await accountsForEmail(row.email);
  const accountId = row.account_id && members.some((m) => m.accountId === row.account_id) ? row.account_id : members[0]?.accountId;
  const membership = members.find((m) => m.accountId === accountId);
  if (!accountId || !membership) {
    await run("DELETE FROM sessions WHERE token_hash = ?", [h]);
    return null;
  }
  if (now - Number(row.last_used_at) > RENEW_MS) await run("UPDATE sessions SET last_used_at = ? WHERE token_hash = ?", [now, h]);
  return { email: row.email, role: membership.role, accountId };
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
