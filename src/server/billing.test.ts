import type Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useTestServer } from "@/test/server";

import { accountById, createAccount, setAccountPlan, setStripeIds } from "./accounts";
import {
  applySubscription,
  createCheckoutSession,
  handleStripeWebhook,
  planFromSubscriptionStatus,
  priceFor,
  resetBillingForTests,
  setStripeForTests,
  stripeEnabled,
  subscriptionIdFromInvoice,
  yearlyEnabled,
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
    const account = await createAccount("Cancel home", "cancel@example.com", undefined, { trial: false });
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

  it("charges the yearly price when one is set and falls back to monthly when not", async () => {
    expect(yearlyEnabled()).toBe(false);
    expect(priceFor("year")).toBe("price_test");
    vi.stubEnv("STRIPE_PRICE_ID_YEARLY", "price_yearly");
    try {
      expect(yearlyEnabled()).toBe(true);
      expect(priceFor("year")).toBe("price_yearly");
      expect(priceFor("month")).toBe("price_test");

      const account = await createAccount("Yearly home", "yearly@example.com");
      const stripe = mockStripe({ constructEvent: () => ({ type: "ping", data: { object: {} } }) as unknown as Stripe.Event });
      (stripe.customers.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "cus_year" });
      const create = stripe.checkout.sessions.create as ReturnType<typeof vi.fn>;
      create.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/cs_year" });
      await createCheckoutSession(account.id, "yearly@example.com", "http://localhost", "year");
      const args = create.mock.calls[0]?.[0] as Stripe.Checkout.SessionCreateParams;
      expect(args.line_items).toEqual([{ price: "price_yearly", quantity: 1 }]);
      expect(args.automatic_tax).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("turns on Stripe Tax and saves the address when STRIPE_AUTOMATIC_TAX is 1", async () => {
    vi.stubEnv("STRIPE_AUTOMATIC_TAX", "1");
    try {
      const account = await createAccount("Tax home", "tax@example.com");
      const stripe = mockStripe({ constructEvent: () => ({ type: "ping", data: { object: {} } }) as unknown as Stripe.Event });
      (stripe.customers.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "cus_tax" });
      const create = stripe.checkout.sessions.create as ReturnType<typeof vi.fn>;
      create.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/cs_tax" });
      await createCheckoutSession(account.id, "tax@example.com", "http://localhost");
      const args = create.mock.calls[0]?.[0] as Stripe.Checkout.SessionCreateParams;
      expect(args.automatic_tax).toEqual({ enabled: true });
      expect(args.customer_update).toEqual({ address: "auto", name: "auto" });
      expect(args.line_items).toEqual([{ price: "price_test", quantity: 1 }]);
    } finally {
      vi.unstubAllEnvs();
    }
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
    const account = await createAccount("No sub yet", "nosub@example.com", undefined, { trial: false });
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

describe("Household trial", () => {
  useTestServer({
    STRIPE_SECRET_KEY: "sk_test_x",
    STRIPE_PRICE_ID: "price_test",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
  });

  afterEach(() => {
    resetBillingForTests();
    setStripeForTests(null);
  });

  function checkoutStripe() {
    const create = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/cs_trial" });
    setStripeForTests({
      customers: { create: vi.fn().mockResolvedValue({ id: "cus_trial" }) },
      checkout: { sessions: { create } },
      billingPortal: { sessions: { create: vi.fn() } },
    } as unknown as Stripe);
    return create;
  }

  it("keeps the trial's days left when a trialing household subscribes", async () => {
    const now = Date.now();
    const account = await createAccount("Trial checkout", "trial.checkout@example.com", now);
    expect(account.plan).toBe("paid");
    expect(account.paidPlan).toBe("free");
    const create = checkoutStripe();
    await createCheckoutSession(account.id, "trial.checkout@example.com", "http://localhost");
    const args = create.mock.calls[0]?.[0] as Stripe.Checkout.SessionCreateParams;
    expect(args.subscription_data?.trial_end).toBe(Math.floor((now + 14 * 86_400_000) / 1000));
  });

  it("charges at once in the trial's last two days (Stripe's minimum)", async () => {
    const account = await createAccount("Late trial", "late.trial@example.com", Date.now() - 13 * 86_400_000);
    const create = checkoutStripe();
    await createCheckoutSession(account.id, "late.trial@example.com", "http://localhost");
    const args = create.mock.calls[0]?.[0] as Stripe.Checkout.SessionCreateParams;
    expect(args.subscription_data?.trial_end).toBeUndefined();
  });

  it("records the cancel survey's answer once per subscription", async () => {
    const { recordCancellation } = await import("./billing");
    const { query } = await import("./db");
    const account = await createAccount("Leaving home", "leaving@example.com");
    const sub = {
      id: "sub_bye",
      status: "active",
      cancel_at_period_end: true,
      cancel_at: null,
      cancellation_details: { feedback: "too_expensive", comment: "Money's tight", reason: "cancellation_requested" },
      metadata: {},
      customer: "cus_bye",
    } as unknown as Stripe.Subscription;
    await recordCancellation(account.id, sub);
    await recordCancellation(account.id, sub);
    const rows = await query<{ props: string }>("SELECT props FROM admin_events WHERE name = 'household_cancelled'");
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.props)).toEqual({ subscription: "sub_bye", reason: "too_expensive", comment: "Money's tight" });
    const { revenueSummary } = await import("./adminRevenue");
    expect((await revenueSummary()).cancelReasons).toEqual([{ reason: "too_expensive", n: 1 }]);
  });
});
