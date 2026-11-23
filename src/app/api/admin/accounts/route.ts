import { json, notFound, unauthorized } from "@/server/http";
import { staffEnabled, staffFor } from "@/server/staff";
import { listHouseholdsForStaff } from "@/server/staffAccounts";

/** Platform ops: every household. 404 when staff is off or the caller is not on ADMIN_EMAILS (Tuned/Liftsmith). */
export async function GET(req: Request) {
  if (!staffEnabled()) return notFound();
  const session = await staffFor(req);
  if (!session) return unauthorized();
  const households = await listHouseholdsForStaff();
  return json({
    staff: { email: session.email },
    households: households.map((h) => ({
      id: h.id,
      name: h.name,
      plan: h.plan,
      createdAt: h.createdAt,
      deviceCount: h.deviceCount,
      members: h.members,
      hasStripe: Boolean(h.stripeCustomerId),
    })),
  });
}
