import "server-only";

import { signInHref } from "@/lib/site";

import { requestSession, signedInEmail, TEST_SESSION_COOKIE } from "./auth";
import { sha256 } from "./crypto";
import { env } from "./env";
import { json, notFound, sameOrigin } from "./http";

// Platform staff for /admin/ (Melvin, 2026-11-24; 2FA removed 2026-11-25): same Clerk sign-in as a household,
// gated only by ADMIN_EMAILS. Any second factor is Clerk's, completed before this app loads.

/** @deprecated Staff no longer use a separate cookie; Clerk (or test) session is enough. */
export const ADMIN_COOKIE = "ep_admin";

export type StaffRole = "admin";

export interface Staff {
  email: string;
  role: StaffRole;
}

export interface StaffSession extends Staff {
  sessionHash: string;
}

export function staffEnabled(): boolean {
  return env.adminEmails().size > 0;
}

export function roleOf(email: string): StaffRole | null {
  return env.adminEmails().has(email.trim().toLowerCase()) ? "admin" : null;
}

export async function audit(admin: string, action: string, target: string | null, detail?: unknown): Promise<void> {
  const { run } = await import("./db");
  await run("INSERT INTO admin_audit (at, admin, action, target, detail) VALUES (?, ?, ?, ?, ?)", [
    Date.now(),
    admin,
    action,
    target,
    detail === undefined ? null : JSON.stringify(detail).slice(0, 2000),
  ]);
}

export async function getStaffSession(req?: Request): Promise<StaffSession | null> {
  const email = (await signedInEmail(req)) ?? (await requestSession(req))?.email;
  if (!email) return null;
  const role = roleOf(email);
  if (!role) return null;
  return { email, role, sessionHash: sha256(`staff:${email}`) };
}

export async function getStaff(req?: Request): Promise<Staff | null> {
  const s = await getStaffSession(req);
  return s ? { email: s.email, role: s.role } : null;
}

/** Guards an admin route: 404 for anyone else. */
export async function requireStaff(req: Request, _opts: { write?: boolean } = {}): Promise<{ staff: Staff } | { response: Response }> {
  void _opts;
  if (!staffEnabled()) return { response: notFound() };
  if (req.method !== "GET" && !sameOrigin(req)) return { response: json({ error: "Bad origin" }, 403) };
  let staff: Staff | null;
  try {
    staff = await getStaff(req);
  } catch {
    return { response: json({ error: "The database didn't answer. Try again in a moment." }, 503) };
  }
  if (!staff) return { response: notFound() };
  return { staff };
}

export async function signOutAdmin(_req: Request): Promise<Response> {
  void _req;
  // Client calls Clerk signOut; this clears any leftover test cookie.
  const res = json({ ok: true, redirect: signInHref("/admin/") });
  res.headers.append("Set-Cookie", `${TEST_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.headers.append("Set-Cookie", `${ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  return res;
}
