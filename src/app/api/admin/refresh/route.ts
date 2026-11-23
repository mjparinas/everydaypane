import { touchConfig } from "@/server/config";
import { json, sameOrigin, unauthorized } from "@/server/http";
import { planForAccount } from "@/server/planGates";
import { adminFor } from "@/server/viewer";

/** Bumps the settings version so watching displays reload at once (Household). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  if ((await planForAccount(session.accountId)) !== "paid") {
    return json({ error: "Instant refresh needs Household." }, 402);
  }
  await touchConfig(session.accountId);
  return json({ ok: true });
}
