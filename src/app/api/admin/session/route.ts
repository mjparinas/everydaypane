import { getStaffSession, staffEnabled } from "@/server/adminAuth";
import { json, notFound } from "@/server/http";

/** Staff session probe for the admin SPA. Signed-out visitors are sent to Clerk. */
export async function GET(req: Request) {
  if (!staffEnabled()) return notFound();
  try {
    const session = await getStaffSession(req);
    if (!session) return json({ state: "signin" as const });
    return json({ state: "ok" as const, email: session.email, role: session.role });
  } catch {
    return json({ error: "The database didn't answer." }, 503);
  }
}
