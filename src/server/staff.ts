import "server-only";

import { requestSession, type Session } from "./auth";
import { env } from "./env";

// Platform staff (Melvin, 2026-11-23): /admin/ is for Everydaypane ops, not household settings.
// Same pattern as Tuned and Liftsmith — only addresses on ADMIN_EMAILS. Household settings live at /household/.

/** True when the email is on ADMIN_EMAILS (platform ops allow-list). */
export function isStaffEmail(email: string): boolean {
  return env.adminEmails().has(email.trim().toLowerCase());
}

/** Whether the platform admin panel is configured (at least one staff address). */
export function staffEnabled(): boolean {
  return env.adminEmails().size > 0;
}

/** A signed-in session whose email is on ADMIN_EMAILS. Null when unsigned or not staff. */
export async function staffFor(req: Request): Promise<Session | null> {
  if (!staffEnabled()) return null;
  const session = await requestSession(req);
  return session && isStaffEmail(session.email) ? session : null;
}
