import "server-only";

import { authTestMode, clerkConfigured, requestSession, signedInEmail, TEST_SESSION_COOKIE } from "./auth";
import { sha256 } from "./crypto";
import { env } from "./env";
import { json, notFound, sameOrigin } from "./http";

// Platform staff for /admin/ (Melvin, 2026-11-24): same Clerk identity as household, gated by ADMIN_EMAILS /
// SUPPORT_EMAILS. MFA is Clerk's second factor (`factorVerificationAge`); custom TOTP is retired.

/** @deprecated Staff no longer use a separate cookie; Clerk (or test) session is enough. */
export const ADMIN_COOKIE = "ep_admin";

export type StaffRole = "admin" | "support";

export interface Staff {
  email: string;
  role: StaffRole;
}

export interface StaffSession extends Staff {
  sessionHash: string;
  twoFactor: boolean;
  ready: boolean;
}

export function staffEnabled(): boolean {
  return env.adminEmails().size > 0 || env.supportEmails().size > 0;
}

export function roleOf(email: string): StaffRole | null {
  const e = email.trim().toLowerCase();
  if (env.adminEmails().has(e)) return "admin";
  if (env.supportEmails().has(e)) return "support";
  return null;
}

export async function reportStaffFailure(email: string, kind: string, now = Date.now()): Promise<void> {
  const { run } = await import("./db");
  await run("INSERT INTO staff_sign_in_failures (email, kind, at) VALUES (?, ?, ?)", [email, kind, now]);
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

async function clerkSecondFactorOk(): Promise<{ enrolled: boolean; verified: boolean }> {
  if (!clerkConfigured() || authTestMode()) return { enrolled: true, verified: true };
  try {
    const { auth } = await import("@clerk/nextjs/server");
    const a = await auth();
    const fva = a.factorVerificationAge;
    // Tuple of [firstFactorAgeMinutes, secondFactorAgeMinutes]; -1 means that factor was not used.
    const verified = Array.isArray(fva) && typeof fva[1] === "number" && fva[1] >= 0;
    return { enrolled: verified, verified };
  } catch {
    return { enrolled: false, verified: false };
  }
}

export async function getStaffSession(req?: Request): Promise<StaffSession | null> {
  const email = (await signedInEmail(req)) ?? (await requestSession(req))?.email;
  if (!email) return null;
  const role = roleOf(email);
  if (!role) return null;

  const mode = env.admin2fa();
  const { verified } = await clerkSecondFactorOk();
  const ready = mode === "optional" || verified || authTestMode();

  return {
    email,
    role,
    sessionHash: sha256(`staff:${email}`),
    twoFactor: mode === "required",
    ready,
  };
}

export async function getStaff(req?: Request): Promise<Staff | null> {
  const s = await getStaffSession(req);
  return s?.ready ? { email: s.email, role: s.role } : null;
}

/** Guards an admin route: 404 for anyone else. Writes need role admin. */
export async function requireStaff(req: Request, opts: { write?: boolean } = {}): Promise<{ staff: Staff } | { response: Response }> {
  if (!staffEnabled()) return { response: notFound() };
  if (req.method !== "GET" && !sameOrigin(req)) return { response: json({ error: "Bad origin" }, 403) };
  let staff: Staff | null;
  try {
    staff = await getStaff(req);
  } catch {
    return { response: json({ error: "The database didn't answer. Try again in a moment." }, 503) };
  }
  if (!staff || (opts.write && staff.role !== "admin")) return { response: notFound() };
  return { staff };
}

/** @deprecated Staff sign-in is Clerk `/signin/`. */
export async function startAdminSignIn(_req: Request, _email: string): Promise<Response> {
  void _req;
  void _email;
  return json({
    ok: true,
    message: "Staff sign in at /signin/?next=/admin/ with the same Clerk account. MFA is required when ADMIN_2FA is not optional.",
    redirect: "/signin/?next=/admin/",
  });
}

/** @deprecated */
export async function finishAdminSignIn(_req: Request): Promise<Response> {
  void _req;
  return new Response(null, { status: 303, headers: { Location: "/signin/?next=/admin/", "Cache-Control": "no-store" } });
}

export async function signOutAdmin(_req: Request): Promise<Response> {
  void _req;
  // Client calls Clerk signOut; this clears any leftover test cookie.
  const res = json({ ok: true, redirect: "/signin/?next=/admin/" });
  res.headers.append("Set-Cookie", `${TEST_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.headers.append("Set-Cookie", `${ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  return res;
}
