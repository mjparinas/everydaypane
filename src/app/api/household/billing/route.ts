import { planLabel, trialDaysLeft } from "@/lib/plans";
import { accountById, startTrial } from "@/server/accounts";
import { createCheckoutSession, createPortalSession, stripeEnabled, yearlyEnabled } from "@/server/billing";
import { json, sameOrigin, unauthorized } from "@/server/http";
import { adminFor } from "@/server/viewer";

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const account = await accountById(session.accountId);
  if (!account) return json({ error: "Account not found" }, 404);
  const now = Date.now();
  return json({
    plan: account.plan,
    planLabel: planLabel(account.plan),
    paidPlan: account.paidPlan,
    // Household trial (Melvin, 2026-11-28): running, never had (Try Household starts one), or over.
    trialEndsAt: account.trialEndsAt,
    trialDaysLeft: account.paidPlan === "paid" ? 0 : trialDaysLeft(account.trialEndsAt, now),
    trialAvailable: account.paidPlan === "free" && account.trialEndsAt === null,
    stripeEnabled: stripeEnabled(),
    yearlyEnabled: yearlyEnabled(),
    hasCustomer: Boolean(account.stripeCustomerId),
  });
}

/** Starts the Household trial, Stripe Checkout (upgrade) or the Customer Portal (manage). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "checkout";
  if (action === "trial") {
    // Needs no Stripe: the trial asks for no card.
    const started = await startTrial(session.accountId);
    if (!started) return json({ error: "This household has already had its Household trial." }, 409);
    const { recordEvent } = await import("@/server/adminAnalytics");
    await recordEvent("trial_started", { source: "try" }, session.accountId);
    const { touchConfig } = await import("@/server/config");
    // Walls reload so the Household view, schedule and screen saver come back at once.
    await touchConfig(session.accountId);
    return json({ ok: true });
  }
  if (!stripeEnabled()) return json({ error: "Billing is not configured yet." }, 503);
  const origin = url.origin;
  try {
    if (action === "portal") {
      const portal = await createPortalSession(session.accountId, origin);
      return json({ url: portal });
    }
    const interval = url.searchParams.get("interval") === "year" ? "year" : "month";
    const checkout = await createCheckoutSession(session.accountId, session.email, origin, interval);
    return json({ url: checkout });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Billing failed" }, 400);
  }
}
