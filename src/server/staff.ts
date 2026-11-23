import "server-only";

import { requestSession, type Session } from "./auth";
import { env } from "./env";

// Platform staff link from the household panel: ADMIN_EMAILS still get a "Platform" nav item.
// The /admin/ SPA itself uses dedicated staff sessions in adminAuth.ts (Melvin, 2026-11-23).

/** True when the email is on ADMIN_EMAILS (full platform ops). */
export function isStaffEmail(email: string): boolean {
  return env.adminEmails().has(email.trim().toLowerCase());
}

/** Whether the platform admin panel is configured (at least one staff address). */
export function staffEnabled(): boolean {
  return env.adminEmails().size > 0 || env.supportEmails().size > 0;
}

/** Household session whose email is on ADMIN_EMAILS (for the Platform nav link only). */
export async function staffFor(req: Request): Promise<Session | null> {
  if (!env.adminEmails().size) return null;
  const session = await requestSession(req);
  return session && isStaffEmail(session.email) ? session : null;
}
