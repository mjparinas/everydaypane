import type Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useTestServer } from "@/test/server";

import { accountById, createAccount, setAccountPlan, setStripeIds } from "./accounts";
import {
  applySubscription,
  createCheckoutSession,
  handleStripeWebhook,
  planFromSubscriptionStatus,
  resetBillingForTests,
  setStripeForTests,
  stripeEnabled,
  subscriptionIdFromInvoice,
} from "./billing";

describe("subscriptionIdFromInvoice", () => {
  it("reads the Stripe 2025+ parent.subscription_details shape", () => {
    const invoice = {
      parent: {
        type: "subscription_details",
        subscription_details: { subscription: "sub_new_shape" },
        quote_details: null,
      },
    } as Stripe.Invoice;
    expect(subscriptionIdFromInvoice(invoice)).toBe("sub_new_shape");
  });

  it("still accepts a legacy top-level subscription field", () => {
    const invoice = { parent: null, subscription: "sub_legacy" } as Stripe.Invoice & { subscription: string };
    expect(subscriptionIdFromInvoice(invoice)).toBe("sub_legacy");
  });

  it("returns null when neither shape is present", () => {
    expect(subscriptionIdFromInvoice({ parent: null } as Stripe.Invoice)).toBeNull();
  });
});

describe("billing webhooks", () => {
  useTestServer({
    STRIPE_SECRET_KEY: "sk_test_x",
    STRIPE_PRICE_ID: "price_test",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
  });

  afterEach(() => {
    resetBillingForTests();
    setStripeForTests(null);
  });

  function mockStripe(handlers: {
    constructEvent: (body: string, sig: string, secret: string) => Stripe.Event;
    retrieve?: (id: string) => Promise<Stripe.Subscription>;
  }) {
    const stripe = {
      webhooks: { constructEvent: handlers.constructEvent },
      subscriptions: { retrieve: handlers.retrieve ?? (async () => ({ id: "sub_x", status: "active", metadata: {} })) },
      customers: { create: vi.fn() },
      checkout: { sessions: { create: vi.fn() } },
      billingPortal: { sessions: { create: vi.fn() } },
    };
    setStripeForTests(stripe as unknown as Stripe);
    return stripe;
  }

  it("reports Stripe as enabled when key and price are set", () => {
    expect(stripeEnabled()).toBe(true);
  });

  it("marks a household Paid on checkout.session.completed", async () => {
    const account = await createAccount("Billing home", "billing@example.com");
    mockStripe({
      constructEvent: () =>
        ({
          type: "checkout.session.completed",
          data: {
            object: {
              mode: "subscription",
              client_reference_id: account.id,
              metadata: { accountId: account.id },
              customer: "cus_123",
              subscription: "sub_123",
            },
          },
        }) as unknown as Stripe.Event,
      retrieve: async () =>
        ({ id: "sub_123", status: "active", metadata: { accountId: account.id }, customer: "cus_123" }) as unknown as Stripe.Subscription,
    });

    await handleStripeWebhook("{}", "sig");
    const updated = await accountById(account.id);
    expect(updated?.plan).toBe("paid");
    expect(updated?.stripeCustomerId).toBe("cus_123");
    expect(updated?.stripeSubscriptionId).toBe("sub_123");
  });

  it("applies invoice.paid using parent.subscription_details", async () => {
    const account = await createAccount("Invoice home", "invoice@example.com");
    await setStripeIds(account.id, { customerId: "cus_inv", subscriptionId: "sub_inv" });
    mockStripe({
      constructEvent: () =>
        ({
          type: "invoice.paid",
          data: {
            object: {
              parent: {
                type: "subscription_details",
                subscription_details: { subscription: "sub_inv" },
                quote_details: null,
              },
            },
          },
        }) as unknown as Stripe.Event,
      retrieve: async () =>
        ({ id: "sub_inv", status: "active", metadata: { accountId: account.id }, customer: "cus_inv" }) as unknown as Stripe.Subscription,
    });

    await handleStripeWebhook("{}", "sig");
    expect((await accountById(account.id))?.plan).toBe("paid");
  });

  it("demotes on subscription deleted", async () => {
    const account = await createAccount("Cancel home", "cancel@example.com");
    await setAccountPlan(account.id, "paid");
    await setStripeIds(account.id, { customerId: "cus_c", subscriptionId: "sub_c" });
    mockStripe({
      constructEvent: () =>
        ({
          type: "customer.subscription.deleted",
          data: {
            object: {
              id: "sub_c",
              status: "canceled",
              metadata: { accountId: account.id },
              customer: "cus_c",
            },
          },
        }) as unknown as Stripe.Event,
    });

    await handleStripeWebhook("{}", "sig");
    expect((await accountById(account.id))?.plan).toBe("free");
  });

  it("creates a Checkout session URL for an upgrade", async () => {
    const account = await createAccount("Checkout home", "checkout@example.com");
    const stripe = mockStripe({
      constructEvent: () => ({ type: "ping", data: { object: {} } }) as unknown as Stripe.Event,
    });
    (stripe.customers.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "cus_new" });
    (stripe.checkout.sessions.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      url: "https://checkout.stripe.com/c/pay/cs_test",
    });

    const url = await createCheckoutSession(account.id, "checkout@example.com", "http://localhost");
    expect(url).toBe("https://checkout.stripe.com/c/pay/cs_test");
    expect((await accountById(account.id))?.stripeCustomerId).toBe("cus_new");
  });

  it("applySubscription keeps trialing and past_due as Paid", async () => {
    expect(planFromSubscriptionStatus("trialing")).toBe("paid");
    expect(planFromSubscriptionStatus("past_due")).toBe("paid");
    expect(planFromSubscriptionStatus("canceled")).toBe("free");
    expect(planFromSubscriptionStatus("unpaid")).toBe("free");

    const account = await createAccount("Trial home", "trial@example.com");
    await applySubscription(account.id, {
      id: "sub_trial",
      status: "trialing",
      metadata: {},
      customer: "cus_t",
    } as unknown as Stripe.Subscription);
    expect((await accountById(account.id))?.plan).toBe("paid");

    await applySubscription(account.id, {
      id: "sub_trial",
      status: "past_due",
      metadata: {},
      customer: "cus_t",
    } as unknown as Stripe.Subscription);
    expect((await accountById(account.id))?.plan).toBe("paid");
  });

  it("sends already-Paid households to the Customer Portal instead of a second Checkout", async () => {
    const account = await createAccount("Paid home", "paid.checkout@example.com");
    await setAccountPlan(account.id, "paid");
    await setStripeIds(account.id, { customerId: "cus_paid" });
    const stripe = mockStripe({
      constructEvent: () => ({ type: "ping", data: { object: {} } }) as unknown as Stripe.Event,
    });
    (stripe.billingPortal.sessions.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      url: "https://billing.stripe.com/p/session_test",
    });

    const url = await createCheckoutSession(account.id, "paid.checkout@example.com", "http://localhost");
    expect(url).toBe("https://billing.stripe.com/p/session_test");
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("does not mark Paid on checkout.session.completed without a subscription id", async () => {
    const account = await createAccount("No sub yet", "nosub@example.com");
    mockStripe({
      constructEvent: () =>
        ({
          type: "checkout.session.completed",
          data: {
            object: {
              mode: "subscription",
              client_reference_id: account.id,
              metadata: { accountId: account.id },
              customer: "cus_pending",
              subscription: null,
            },
          },
        }) as unknown as Stripe.Event,
    });

    await handleStripeWebhook("{}", "sig");
    const updated = await accountById(account.id);
    expect(updated?.plan).toBe("free");
    expect(updated?.stripeCustomerId).toBe("cus_pending");
  });
});
