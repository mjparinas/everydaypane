import { getStaffSession, staffEnabled } from "@/server/adminAuth";
import { json, notFound } from "@/server/http";
import { twoFactorMode, twoFactorState } from "@/server/twoFactor";

/** Staff session probe for the admin SPA gate (signed in / needs 2FA / signed out). */
export async function GET(req: Request) {
  if (!staffEnabled()) return notFound();
  try {
    const session = await getStaffSession(req);
    if (!session) return json({ state: "signin" as const });
    const tf = await twoFactorState(session.email);
    if (!session.ready) {
      return json({
        state: "twofactor" as const,
        email: session.email,
        role: session.role,
        twoFactor: tf,
        mode: twoFactorMode(),
      });
    }
    return json({
      state: "ok" as const,
      email: session.email,
      role: session.role,
      twoFactor: tf,
      mode: twoFactorMode(),
    });
  } catch {
    return json({ error: "The database didn't answer." }, 503);
  }
}
