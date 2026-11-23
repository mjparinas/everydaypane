import "server-only";

import Stripe from "stripe";

import type { PlanId } from "@/lib/plans";

import { accountById, setAccountPlan, setStripeIds } from "./accounts";
import { env } from "./env";

// Stripe Billing for Free + one Paid plan (Melvin, 2026-11-22). Checkout + Customer Portal + webhooks.
// Use a restricted key in production. Price id from the Dashboard lives in STRIPE_PRICE_ID.

let client: Stripe | null = null;

export function stripeEnabled(): boolean {
  return Boolean(env.stripeSecretKey() && env.stripePriceId());
}

export function stripe(): Stripe {
  const key = env.stripeSecretKey();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(key, { apiVersion: "2026-09-30.endive" });
  return client;
}

export async function createCheckoutSession(accountId: string, email: string, origin: string): Promise<string> {
  const account = await accountById(accountId);
  if (!account) throw new Error("Account not found");
  const s = stripe();
  let customerId = account.stripeCustomerId;
  if (!customerId) {
    const customer = await s.customers.create({ email, metadata: { accountId } });
    customerId = customer.id;
    await setStripeIds(accountId, { customerId });
  }
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: env.stripePriceId(), quantity: 1 }],
    success_url: `${origin}/admin/?billing=success`,
    cancel_url: `${origin}/admin/?billing=cancel`,
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
    return_url: `${origin}/admin/`,
  });
  return session.url;
}

export async function applySubscription(accountId: string, subscription: Stripe.Subscription): Promise<void> {
  const active = subscription.status === "active" || subscription.status === "trialing";
  await setStripeIds(accountId, { subscriptionId: subscription.id });
  await setAccountPlan(accountId, active ? "paid" : "free");
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
      if (typeof session.subscription === "string") {
        const sub = await stripe().subscriptions.retrieve(session.subscription);
        await applySubscription(accountId, sub);
      } else {
        await setAccountPlan(accountId, "paid");
      }
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
      const inv = invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
      const subId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id;
      if (!subId) break;
      const sub = await stripe().subscriptions.retrieve(subId);
      const accountId = sub.metadata?.accountId || (await accountIdForSubscription(sub));
      if (accountId) await applySubscription(accountId, sub);
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const inv = invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
      const subId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id;
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
