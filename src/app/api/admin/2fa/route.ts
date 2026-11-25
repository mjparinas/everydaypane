import { getStaffSession, staffEnabled } from "@/server/adminAuth";
import { json, notFound } from "@/server/http";
import { twoFactorMode } from "@/server/twoFactor";

/** Staff MFA is Clerk's second factor. This route only reports status for the admin SPA gate. */
export async function GET(req: Request) {
  if (!staffEnabled()) return notFound();
  const session = await getStaffSession(req);
  if (!session) return json({ state: "signin" as const });
  return json({
    state: session.ready ? ("ok" as const) : ("twofactor" as const),
    email: session.email,
    role: session.role,
    twoFactor: { enabled: session.twoFactor, provider: "clerk" as const },
    mode: twoFactorMode(),
  });
}

export async function POST() {
  return json({ error: "Staff MFA is managed in Clerk. Sign out and complete the second factor there." }, 410);
}
