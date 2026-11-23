import { requireStaff, staffEnabled } from "@/server/adminAuth";
import { json, notFound } from "@/server/http";
import { listHouseholdsForStaff } from "@/server/staffAccounts";

/** Platform ops: every household (also available as GET /api/admin/households/). */
export async function GET(req: Request) {
  if (!staffEnabled()) return notFound();
  const gate = await requireStaff(req);
  if ("response" in gate) return gate.response;
  const households = await listHouseholdsForStaff();
  return json({
    staff: gate.staff,
    households: households.map((h) => ({
      id: h.id,
      name: h.name,
      plan: h.plan,
      createdAt: h.createdAt,
      deviceCount: h.deviceCount,
      members: h.members,
      hasStripe: Boolean(h.stripeCustomerId),
      stripeCustomerId: h.stripeCustomerId,
      stripeSubscriptionId: h.stripeSubscriptionId,
    })),
  });
}
