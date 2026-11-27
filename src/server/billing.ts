import "server-only";

import Stripe from "stripe";

import type { PlanId } from "@/lib/plans";

import { accountById, setAccountPlan, setStripeIds } from "./accounts";
import { env } from "./env";

// Stripe Billing for Free + one Paid plan (Melvin, 2026-11-22). Checkout + Customer Portal + webhooks.
// Use a restricted key in production. Price id from the Dashboard lives in STRIPE_PRICE_ID.

let client: Stripe | null = null;

/** Tests inject a fake Stripe client so webhooks and Checkout can run without network. */
export function resetBillingForTests(): void {
  client = null;
}

export function setStripeForTests(mock: Stripe | null): void {
  client = mock;
}

export function stripeEnabled(): boolean {
  return Boolean(env.stripeSecretKey() && env.stripePriceId());
}

export type BillingInterval = "month" | "year";

/** True when a yearly price is set, so Checkout can offer yearly (Melvin, 2026-11-27: marketing sells $59/yr). */
export function yearlyEnabled(): boolean {
  return stripeEnabled() && Boolean(env.stripePriceIdYearly());
}

/** The price for an interval; yearly falls back to monthly when no yearly price exists, so the button never dead-ends. */
export function priceFor(interval: BillingInterval): string {
  return interval === "year" && env.stripePriceIdYearly() ? env.stripePriceIdYearly() : env.stripePriceId();
}

export function stripe(): Stripe {
  if (client) return client;
  const key = env.stripeSecretKey();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client = new Stripe(key, { apiVersion: "2026-11-18.endive" });
  return client;
}

export async function createCheckoutSession(
  accountId: string,
  email: string,
  origin: string,
  interval: BillingInterval = "month",
): Promise<string> {
  const account = await accountById(accountId);
  if (!account) throw new Error("Account not found");
  // Already on Household: open the portal instead of stacking another subscription Checkout.
  if (account.plan === "paid" && account.stripeCustomerId) {
    return createPortalSession(accountId, origin);
  }
  const s = stripe();
  let customerId = account.stripeCustomerId;
  if (!customerId) {
    const customer = await s.customers.create({ email, metadata: { accountId } });
    customerId = customer.id;
    await setStripeIds(accountId, { customerId });
  }
  const tax = env.stripeAutomaticTax();
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceFor(interval), quantity: 1 }],
    // Stripe Tax needs the buyer's address; saving it on the customer keeps renewals taxed the same way.
    ...(tax ? { automatic_tax: { enabled: true }, customer_update: { address: "auto" as const, name: "auto" as const } } : {}),
    success_url: `${origin}/household/?billing=success`,
    cancel_url: `${origin}/household/?billing=cancel`,
    client_reference_id: accountId,
    metadata: { accountId },
    subscription_data: { metadata: { accountId } },
    // Omit payment_method_types — Stripe picks methods dynamically (stripe-best-practices).
  });
  if (!session.url) throw new Error("Checkout session had no URL");
  return session.url;
}

export async function createPortalSession(accountId: string, origin: string): Promise<string> {
  const account = await accountById(accountId);
  if (!account?.stripeCustomerId) throw new Error("No Stripe customer");
  const session = await stripe().billingPortal.sessions.create({
    customer: account.stripeCustomerId,
    return_url: `${origin}/household/`,
  });
  return session.url;
}

/** Statuses that keep Household access. `past_due` is a grace window (matches invoice.payment_failed). */
export function planFromSubscriptionStatus(status: Stripe.Subscription.Status): PlanId {
  return status === "active" || status === "trialing" || status === "past_due" || status === "paused" ? "paid" : "free";
}

export async function applySubscription(accountId: string, subscription: Stripe.Subscription): Promise<void> {
  await setStripeIds(accountId, { subscriptionId: subscription.id });
  const plan = planFromSubscriptionStatus(subscription.status);
  await setAccountPlan(accountId, plan);
  if (plan === "paid") {
    const { recordEvent } = await import("./adminAnalytics");
    await recordEvent("household_upgraded", { source: "stripe" }, accountId);
  }
}

/**
 * Stripe API 2025+ moved the subscription id onto `invoice.parent.subscription_details.subscription`.
 * Older webhook payloads still send top-level `subscription` — accept both.
 */
export function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent;
  if (parent?.type === "subscription_details" && parent.subscription_details) {
    const sub = parent.subscription_details.subscription;
    if (typeof sub === "string") return sub;
    if (sub && typeof sub === "object" && "id" in sub) return sub.id;
  }
  const legacy = invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
  if (typeof legacy.subscription === "string") return legacy.subscription;
  if (legacy.subscription && typeof legacy.subscription === "object") return legacy.subscription.id;
  return null;
}

export async function handleStripeWebhook(rawBody: string, signature: string): Promise<void> {
  const secret = env.stripeWebhookSecret();
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  const event = stripe().webhooks.constructEvent(rawBody, signature, secret);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const accountId = session.client_reference_id || session.metadata?.accountId;
      if (!accountId || session.mode !== "subscription") break;
      if (typeof session.customer === "string") await setStripeIds(accountId, { customerId: session.customer });
      const subRef = session.subscription;
      const subId = typeof subRef === "string" ? subRef : subRef && typeof subRef === "object" ? subRef.id : null;
      if (subId) {
        const sub = await stripe().subscriptions.retrieve(subId);
        await applySubscription(accountId, sub);
      }
      // No subscription id yet — wait for customer.subscription.* / invoice.paid rather than guessing Paid.
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const accountId = sub.metadata?.accountId || (await accountIdForSubscription(sub));
      if (accountId) await applySubscription(accountId, sub);
      break;
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = subscriptionIdFromInvoice(invoice);
      if (!subId) break;
      const sub = await stripe().subscriptions.retrieve(subId);
      const accountId = sub.metadata?.accountId || (await accountIdForSubscription(sub));
      if (accountId) await applySubscription(accountId, sub);
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = subscriptionIdFromInvoice(invoice);
      if (!subId) break;
      const sub = await stripe().subscriptions.retrieve(subId);
      const accountId = sub.metadata?.accountId || (await accountIdForSubscription(sub));
      // Keep paid until subscription actually becomes unpaid/canceled via subscription.* events.
      if (accountId && (sub.status === "unpaid" || sub.status === "canceled")) await setAccountPlan(accountId, "free");
      break;
    }
    default:
      break;
  }
}

async function accountIdForSubscription(sub: Stripe.Subscription): Promise<string | null> {
  if (sub.metadata?.accountId) return sub.metadata.accountId;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const { query } = await import("./db");
  const row = (
    await query<{ id: string }>("SELECT id FROM accounts WHERE stripe_subscription_id = ? OR stripe_customer_id = ?", [sub.id, customerId])
  )[0];
  return row?.id ?? null;
}

export function planOf(account: { plan: PlanId }): PlanId {
  return account.plan;
}
