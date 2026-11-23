import { planLabel } from "@/lib/plans";
import { accountById } from "@/server/accounts";
import { createCheckoutSession, createPortalSession, stripeEnabled } from "@/server/billing";
import { json, sameOrigin, unauthorized } from "@/server/http";
import { adminFor } from "@/server/viewer";

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const account = await accountById(session.accountId);
  if (!account) return json({ error: "Account not found" }, 404);
  return json({
    plan: account.plan,
    planLabel: planLabel(account.plan),
    stripeEnabled: stripeEnabled(),
    hasCustomer: Boolean(account.stripeCustomerId),
  });
}

/** Starts Stripe Checkout (upgrade) or the Customer Portal (manage). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  if (!stripeEnabled()) return json({ error: "Billing is not configured yet." }, 503);
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "checkout";
  const origin = url.origin;
  try {
    if (action === "portal") {
      const portal = await createPortalSession(session.accountId, origin);
      return json({ url: portal });
    }
    const checkout = await createCheckoutSession(session.accountId, session.email, origin);
    return json({ url: checkout });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Billing failed" }, 400);
  }
}
