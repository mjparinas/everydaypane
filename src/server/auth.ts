import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { authTestMode, clerkConfigured, TEST_SESSION_COOKIE } from "@/lib/authFlags";

import { accountsForEmail, type MemberRole } from "./accounts";
import { env } from "./env";

// Household identity via Clerk (Melvin, 2026-11-24). Turso `account_members` stays the source of truth for
// household membership and admin|family roles. Wall QR unlock (`ep_wall` / `ep_display`) is separate and unchanged.
// AUTH_TEST_MODE / Vitest use a signed `ep_test_session` cookie so CI and unit tests need no Clerk keys.

export { authTestMode, clerkConfigured, TEST_SESSION_COOKIE };
/** @deprecated Prefer Clerk; kept only so e2e cookie helpers can rename cleanly. */
export const SESSION_COOKIE = TEST_SESSION_COOKIE;

export type Role = MemberRole;
export interface Session {
  email: string;
  role: Role;
  accountId: string;
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

function testSessionKey(): Buffer {
  const secret = env.sessionSecret();
  if (secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return createHmac("sha256", secret).update("ep-test-session").digest();
}

function signTestPayload(payload: string): string {
  return createHmac("sha256", testSessionKey()).update(payload).digest("base64url");
}

export function encodeTestSession(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${payload}.${signTestPayload(payload)}`;
}

export function decodeTestSession(value: string | undefined): Session | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = signTestPayload(payload);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const raw = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<Session>;
    if (typeof raw.email !== "string" || typeof raw.accountId !== "string") return null;
    if (raw.role !== "admin" && raw.role !== "family") return null;
    return { email: raw.email.toLowerCase(), role: raw.role, accountId: raw.accountId };
  } catch {
    return null;
  }
}

export function testSessionCookie(session: Session): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${TEST_SESSION_COOKIE}=${encodeTestSession(session)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86_400}${secure}`;
}

export const clearedTestSessionCookie = () => `${TEST_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

/** @deprecated Use testSessionCookie in AUTH_TEST_MODE. */
export const sessionCookie = testSessionCookie;
export const clearedSessionCookie = clearedTestSessionCookie;

export async function sessionFromEmail(email: string): Promise<Session | null> {
  const e = email.trim().toLowerCase();
  const members = await accountsForEmail(e);
  const membership = members[0];
  if (!membership) return null;
  return { email: membership.email, role: membership.role, accountId: membership.accountId };
}

async function clerkSession(): Promise<Session | null> {
  if (!clerkConfigured()) return null;
  const { auth, currentUser } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) return null;
  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress?.toLowerCase() ??
    user?.emailAddresses.find((a) => a.id === user.primaryEmailAddressId)?.emailAddress?.toLowerCase() ??
    user?.emailAddresses[0]?.emailAddress?.toLowerCase();
  if (!email) return null;
  return sessionFromEmail(email);
}

/**
 * Resolves the household session for the current request.
 * Prefers Clerk when configured; in AUTH_TEST_MODE / Vitest accepts a signed test cookie.
 */
export async function requestSession(req?: Request): Promise<Session | null> {
  if (authTestMode() && req) {
    const fromTest = decodeTestSession(readCookie(req, TEST_SESSION_COOKIE));
    if (fromTest) {
      // Re-check membership so removing someone still signs them out.
      return sessionFromEmail(fromTest.email);
    }
  }

  try {
    return await clerkSession();
  } catch {
    if (authTestMode() && req) {
      const fromTest = decodeTestSession(readCookie(req, TEST_SESSION_COOKIE));
      return fromTest ? sessionFromEmail(fromTest.email) : null;
    }
    return null;
  }
}

/** Page helpers that previously read `ep_session` from cookies(). */
export async function sessionFor(_cookieValue?: string): Promise<Session | null> {
  if (authTestMode() && _cookieValue) {
    const fromTest = decodeTestSession(_cookieValue);
    if (fromTest) return sessionFromEmail(fromTest.email);
  }
  try {
    return await clerkSession();
  } catch {
    return null;
  }
}

export async function signedInEmail(req?: Request): Promise<string | null> {
  const session = await requestSession(req);
  if (session) return session.email;
  if (!clerkConfigured()) return null;
  try {
    const { auth, currentUser } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    if (!userId) return null;
    const user = await currentUser();
    return user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? user?.emailAddresses[0]?.emailAddress?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export async function endSession(cookieValue?: string): Promise<void> {
  void cookieValue;
  // Clerk sessions are ended via clerkClient.sessions.revokeSession / signOut() on the client.
  // Test cookies are cleared by Set-Cookie Max-Age=0 from the sign-out route.
}

/**
 * Issues a test-mode session for an existing household member (CI / Vitest only).
 */
export async function issueTestSession(email: string): Promise<Session | null> {
  if (!authTestMode()) return null;
  return sessionFromEmail(email.trim().toLowerCase());
}

/** Server pages: Clerk when configured, else the signed test cookie from `cookies()`. */
export async function currentHouseholdSession(cookieValue?: string): Promise<Session | null> {
  if (authTestMode() && cookieValue) {
    const fromTest = decodeTestSession(cookieValue);
    if (fromTest) return sessionFromEmail(fromTest.email);
  }
  return requestSession();
}
