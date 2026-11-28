"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { MARKETING_PLANS, usd } from "@/lib/marketingPlans";
import { inNativeApp } from "@/lib/nativeApp";
import { FREE_LIMITS, PAID_LIMITS, planLabel, TRIAL_DAYS, UPGRADE_REASONS, type PlanId, type UpgradeReasonKey } from "@/lib/plans";

import { Section } from "./fields";

// Soft Free → Household upgrade UX (Melvin, 2026-11-23): badges and greyed controls that open an in-app
// upgrade screen, with quiet CTAs so Free stays usable for clocks, weather, photos and calendars.

type BillingBody = {
  plan?: PlanId;
  planLabel?: string;
  paidPlan?: PlanId;
  trialEndsAt?: number | null;
  trialDaysLeft?: number;
  trialAvailable?: boolean;
  stripeEnabled?: boolean;
  yearlyEnabled?: boolean;
  hasCustomer?: boolean;
};

export type BillingInterval = "month" | "year";

export type PlanContextValue = {
  plan: PlanId;
  planLabel: string;
  stripeEnabled: boolean;
  yearlyEnabled: boolean;
  hasCustomer: boolean;
  loading: boolean;
  /** Household features are on (paying, granted, or in the trial). */
  isPaid: boolean;
  /** Paying (or granted by staff): the trial doesn't count. */
  subscribed: boolean;
  /** In the 14-day Household trial (Melvin, 2026-11-28). */
  trialing: boolean;
  trialDaysLeft: number;
  trialEndsAt: number | null;
  /** Free and never had a trial: "Try Household" starts one. */
  trialAvailable: boolean;
  /** Had a trial that's over and isn't paying. */
  trialEnded: boolean;
  startTrial: () => Promise<boolean>;
  upgradeOpen: boolean;
  upgradeReason: UpgradeReasonKey;
  openUpgrade: (reason?: UpgradeReasonKey) => void;
  closeUpgrade: () => void;
  refresh: () => Promise<void>;
  startCheckout: (interval?: BillingInterval) => Promise<void>;
  openPortal: () => Promise<void>;
  billingBusy: boolean;
  billingError: string;
};

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children, initialPlan = "free" }: { children: ReactNode; initialPlan?: PlanId }) {
  const [plan, setPlan] = useState<PlanId>(initialPlan);
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [yearlyEnabled, setYearlyEnabled] = useState(false);
  const [hasCustomer, setHasCustomer] = useState(false);
  const [paidPlan, setPaidPlan] = useState<PlanId>(initialPlan);
  const [trialEndsAt, setTrialEndsAt] = useState<number | null>(null);
  const [trialDaysLeft, setTrialDaysLeft] = useState(0);
  const [trialAvailable, setTrialAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [upgradeOpen, setUpgradeOpen] = useState(() => typeof window !== "undefined" && window.location.hash === "#upgrade");
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReasonKey>("default");
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState("");
  /** Hash to restore when closing `#upgrade` so Settings deep links aren’t lost (H5, 2026-11-24). State (not ref) keeps the plan context free of render-time ref reads. */
  const [upgradeReturnHash, setUpgradeReturnHash] = useState("#views");

  const apply = useCallback((body: BillingBody | null) => {
    if (!body?.plan) return;
    setPlan(body.plan === "paid" ? "paid" : "free");
    setStripeEnabled(Boolean(body.stripeEnabled));
    setYearlyEnabled(Boolean(body.yearlyEnabled));
    setHasCustomer(Boolean(body.hasCustomer));
    setPaidPlan(body.paidPlan === "paid" ? "paid" : body.paidPlan === "free" ? "free" : body.plan === "paid" ? "paid" : "free");
    setTrialEndsAt(typeof body.trialEndsAt === "number" ? body.trialEndsAt : null);
    setTrialDaysLeft(Number(body.trialDaysLeft) || 0);
    setTrialAvailable(Boolean(body.trialAvailable));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/household/billing/");
      const body = (r.ok ? await r.json() : null) as BillingBody | null;
      apply(body);
    } catch {
      // Keep the last known plan; Free UI still works offline of billing.
    } finally {
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    let live = true;
    // Stripe Checkout returns with ?billing=success|cancel; clear it and thank them after a refresh.
    const params = new URLSearchParams(window.location.search);
    const billing = params.get("billing");
    if (billing) {
      const url = new URL(window.location.href);
      url.searchParams.delete("billing");
      history.replaceState(null, "", `${url.pathname}${url.search}${url.hash || "#views"}`);
    }
    fetch("/api/household/billing/")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: BillingBody | null) => {
        if (!live) return;
        apply(body);
        setLoading(false);
        if (billing === "success") {
          setUpgradeReason("default");
          setUpgradeOpen(true);
        }
      })
      .catch(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [apply]);

  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === "#upgrade") {
        setUpgradeReason("default");
        setUpgradeOpen(true);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const openUpgrade = useCallback((reason: UpgradeReasonKey = "default") => {
    setUpgradeReason(reason);
    setUpgradeOpen(true);
    setBillingError("");
    if (window.location.hash !== "#upgrade") {
      setUpgradeReturnHash(window.location.hash || "#views");
      history.replaceState(null, "", "#upgrade");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  }, []);

  const closeUpgrade = useCallback(() => {
    setUpgradeOpen(false);
    if (window.location.hash === "#upgrade") {
      history.replaceState(null, "", upgradeReturnHash || "#views");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  }, [upgradeReturnHash]);

  const startCheckout = useCallback(async (interval: BillingInterval = "month") => {
    setBillingBusy(true);
    setBillingError("");
    try {
      const r = await fetch(`/api/household/billing/?action=checkout&interval=${interval}`, { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (r.status === 503) {
        setBillingError(j.error ?? "Billing is not configured yet.");
        return;
      }
      if (!r.ok || !j.url) {
        setBillingError(j.error ?? "Couldn't start checkout.");
        return;
      }
      window.location.assign(j.url);
    } catch {
      setBillingError("Couldn't start checkout.");
    } finally {
      setBillingBusy(false);
    }
  }, []);

  /** Starts the no-card Household trial; the plan flips at once and walls reload to show it. */
  const startTrial = useCallback(async (): Promise<boolean> => {
    setBillingBusy(true);
    setBillingError("");
    try {
      const r = await fetch("/api/household/billing/?action=trial", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setBillingError(j.error ?? "Couldn't start the trial.");
        return false;
      }
      await refresh();
      return true;
    } catch {
      setBillingError("Couldn't start the trial.");
      return false;
    } finally {
      setBillingBusy(false);
    }
  }, [refresh]);

  const openPortal = useCallback(async () => {
    setBillingBusy(true);
    setBillingError("");
    try {
      const r = await fetch("/api/household/billing/?action=portal", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!r.ok || !j.url) {
        setBillingError(j.error ?? "Couldn't open billing.");
        return;
      }
      window.location.assign(j.url);
    } catch {
      setBillingError("Couldn't open billing.");
    } finally {
      setBillingBusy(false);
    }
  }, []);

  const value = useMemo<PlanContextValue>(
    () => ({
      plan,
      planLabel: planLabel(plan),
      stripeEnabled,
      yearlyEnabled,
      hasCustomer,
      loading,
      isPaid: plan === "paid",
      subscribed: paidPlan === "paid",
      trialing: plan === "paid" && paidPlan !== "paid" && trialDaysLeft > 0,
      trialDaysLeft,
      trialEndsAt,
      trialAvailable: trialAvailable && plan !== "paid",
      trialEnded: plan !== "paid" && trialEndsAt !== null && !trialAvailable,
      startTrial,
      upgradeOpen,
      upgradeReason,
      openUpgrade,
      closeUpgrade,
      refresh,
      startCheckout,
      openPortal,
      billingBusy,
      billingError,
    }),
    [
      plan,
      stripeEnabled,
      yearlyEnabled,
      hasCustomer,
      loading,
      paidPlan,
      trialDaysLeft,
      trialEndsAt,
      trialAvailable,
      startTrial,
      upgradeOpen,
      upgradeReason,
      openUpgrade,
      closeUpgrade,
      refresh,
      startCheckout,
      openPortal,
      billingBusy,
      billingError,
    ],
  );

  return createElement(PlanContext.Provider, { value }, children);
}

export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan needs PlanProvider");
  return ctx;
}

/** Optional: panels that may render outside the provider during tests. */
export function usePlanOptional(): PlanContextValue | null {
  return useContext(PlanContext);
}

export function HouseholdBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md bg-brand/10 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-brand ${className}`}
    >
      Household
    </span>
  );
}

export function UpgradeLink({ reason = "default", children }: { reason?: UpgradeReasonKey; children: ReactNode }) {
  const { isPaid, openUpgrade } = usePlan();
  if (isPaid) return null;
  return (
    <button type="button" className="font-semibold text-brand underline-offset-2 hover:underline" onClick={() => openUpgrade(reason)}>
      {children}
    </button>
  );
}

/** Greyed control that opens the upgrade screen instead of doing the paid action. */
export function HouseholdLockedButton({
  reason,
  className = "",
  children,
}: {
  reason: UpgradeReasonKey;
  className?: string;
  children: ReactNode;
}) {
  const { openUpgrade } = usePlan();
  return (
    <button
      type="button"
      className={`relative opacity-55 grayscale-[0.35] transition hover:opacity-80 ${className}`}
      onClick={() => openUpgrade(reason)}
    >
      {children}
    </button>
  );
}

/** Full-tab placeholder when Free opens Meals / Shopping / Messages / Schedule. */
export function HouseholdFeaturePrompt({ reason, title, blurb }: { reason: UpgradeReasonKey; title: string; blurb: string }) {
  const { openUpgrade, trialAvailable } = usePlan();
  return (
    <div className="mx-auto grid max-w-lg gap-4 py-8 text-center">
      <div className="flex justify-center">
        <HouseholdBadge />
      </div>
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="text-soft">{blurb}</p>
      <p className="text-sm text-soft">{UPGRADE_REASONS[reason]}</p>
      <button type="button" className="btn-primary justify-self-center" onClick={() => openUpgrade(reason)}>
        {trialAvailable ? "Try Household Free" : "Why Upgrade"}
      </button>
    </div>
  );
}

/** Wraps a Settings section: Free users see a soft overlay that opens upgrade; content stays visible underneath. */
export function HouseholdSoftLock({
  reason,
  children,
  label = "Needs Household",
}: {
  reason: UpgradeReasonKey;
  children: ReactNode;
  label?: string;
}) {
  const { isPaid, openUpgrade, trialAvailable } = usePlan();
  if (isPaid) return <>{children}</>;
  return (
    <div className="relative">
      <div className="pointer-events-none select-none opacity-45">{children}</div>
      <button
        type="button"
        className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-panel/70 p-4 backdrop-blur-[1px]"
        onClick={() => openUpgrade(reason)}
      >
        <span className="card flex max-w-xs flex-col items-center gap-2 p-4 text-center shadow-md">
          <HouseholdBadge />
          <span className="text-sm font-semibold">{label}</span>
          <span className="text-xs text-soft">{trialAvailable ? `Try It Free for ${TRIAL_DAYS} Days` : "Tap to see what’s included"}</span>
        </span>
      </button>
    </div>
  );
}

export function UpgradeDialog() {
  const {
    isPaid: householdOn,
    trialing,
    trialDaysLeft,
    trialEndsAt,
    trialAvailable,
    startTrial,
    upgradeOpen,
    upgradeReason,
    closeUpgrade,
    startCheckout,
    openPortal,
    hasCustomer,
    stripeEnabled,
    yearlyEnabled,
    billingBusy,
    billingError,
  } = usePlan();
  const [chosen, setChosen] = useState<BillingInterval>("year");
  const [trialStarted, setTrialStarted] = useState(false);
  // During the trial the dialog still sells: "paid" here means paying, so the trial sees prices and Subscribe.
  const isPaid = householdOn && !trialing;
  const firstCharge =
    trialEndsAt && trialDaysLeft > 2 ? new Date(trialEndsAt).toLocaleDateString(undefined, { month: "long", day: "numeric" }) : "";
  // App Store and Google Play rules (Melvin, 2026-11-27: no in-app purchase; billing stays on the web): inside the
  // app the dialog still says what Household adds, but shows no price and no way to buy or manage a plan.
  const inApp = inNativeApp();
  // Without a yearly price in Stripe only monthly can be charged, so don't show a yearly total (Melvin, 2026-11-27).
  const interval: BillingInterval = yearlyEnabled ? chosen : "month";

  useEffect(() => {
    if (!upgradeOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeUpgrade();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [upgradeOpen, closeUpgrade]);

  if (!upgradeOpen) return null;

  const paid = MARKETING_PLANS.find((p) => p.id === "paid")!;
  const reason = UPGRADE_REASONS[upgradeReason] ?? UPGRADE_REASONS.default;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" data-testid="upgrade-dialog">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={closeUpgrade} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-title"
        className="relative z-10 flex max-h-[min(92dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-line bg-panel shadow-2xl sm:mx-4 sm:rounded-3xl"
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="mb-1">
              <HouseholdBadge />
            </div>
            <h2 id="upgrade-title" className="text-xl font-bold">
              {trialStarted
                ? "Your Household Trial Has Started"
                : isPaid
                  ? "You’re on Household"
                  : trialing
                    ? "Keep Household After Your Trial"
                    : trialAvailable
                      ? `Try Household Free for ${TRIAL_DAYS} Days`
                      : "Upgrade to Household"}
            </h2>
            <p className="mt-1 text-sm text-soft">
              {trialStarted
                ? `Every widget and family tool is on for ${TRIAL_DAYS} days. Your walls are reloading now.`
                : isPaid
                  ? "Thanks — every widget and family tool is unlocked."
                  : trialing
                    ? `${trialDaysLeft} ${trialDaysLeft === 1 ? "day" : "days"} left. ${
                        firstCharge ? `Subscribe now and your first charge is on ${firstCharge}.` : "Subscribe to keep everything as it is."
                      }`
                    : trialAvailable
                      ? `${reason} No card needed. After ${TRIAL_DAYS} days you’re back on Free unless you subscribe.`
                      : reason}
            </p>
          </div>
          <button type="button" className="btn-ghost min-h-9 shrink-0 px-3" onClick={closeUpgrade} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="grid flex-1 gap-4 overflow-y-auto px-5 py-4">
          {!isPaid && !trialStarted && (
            <>
              <p className="text-sm text-ink">{paid.blurb}</p>
              <ul className="grid gap-2 text-sm">
                {paid.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="mt-0.5 text-brand" aria-hidden="true">
                      ✓
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className={`rounded-2xl bg-bg p-4 text-sm ${inApp ? "hidden" : ""}`}>
                {yearlyEnabled ? (
                  <div className="mb-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Billing">
                    {(["year", "month"] as const).map((i) => (
                      <button
                        key={i}
                        type="button"
                        role="radio"
                        aria-checked={interval === i}
                        className={`min-h-11 rounded-xl border px-3 font-semibold ${
                          interval === i ? "border-brand bg-panel text-brand" : "border-line text-soft"
                        }`}
                        onClick={() => setChosen(i)}
                      >
                        {i === "year" ? "Yearly" : "Monthly"}
                      </button>
                    ))}
                  </div>
                ) : null}
                <p className="font-semibold">
                  {interval === "year" ? (
                    <>
                      {usd(paid.priceYearly)} / year{" "}
                      <span className="font-normal text-soft">· about {usd(paid.priceYearly / 12)} / month</span>
                    </>
                  ) : (
                    <>
                      {usd(paid.priceMonthly)} / month
                      {yearlyEnabled ? (
                        <span className="font-normal text-soft"> · yearly saves {usd(paid.priceMonthly * 12 - paid.priceYearly)}</span>
                      ) : null}
                    </>
                  )}
                </p>
                <p className="mt-1 text-soft">
                  Free keeps {FREE_LIMITS.views} view, {FREE_LIMITS.displays} displays and {FREE_LIMITS.calendars} calendars. Household goes
                  to {PAID_LIMITS.views} views, {PAID_LIMITS.displays} displays and every widget.
                </p>
              </div>
            </>
          )}
          {billingError ? (
            <p className="text-sm text-bad" role="alert">
              {billingError}
            </p>
          ) : null}
        </div>
        <div className="grid gap-2 border-t border-line px-5 py-4">
          {trialStarted ? (
            <button type="button" className="btn-primary" onClick={closeUpgrade}>
              Start Exploring
            </button>
          ) : trialAvailable && !isPaid ? (
            // The trial takes no card, so it's offered in the app too (no purchase happens there).
            <button
              type="button"
              className="btn-primary"
              disabled={billingBusy}
              data-cta="household-trial"
              onClick={() => void startTrial().then((ok) => setTrialStarted(ok))}
            >
              {billingBusy ? "Starting…" : `Start ${TRIAL_DAYS}-Day Free Trial`}
            </button>
          ) : null}
          {trialStarted || (trialAvailable && !isPaid && !stripeEnabled) ? null : inApp ? (
            <p className="text-sm text-soft">{isPaid ? "Plans can't be changed in the app." : "Plans aren't sold in the app."}</p>
          ) : isPaid ? (
            hasCustomer ? (
              <button type="button" className="btn-primary" disabled={billingBusy || !stripeEnabled} onClick={() => void openPortal()}>
                {billingBusy ? "Opening…" : "Manage Billing"}
              </button>
            ) : (
              <button type="button" className="btn-primary" onClick={closeUpgrade}>
                Continue
              </button>
            )
          ) : (
            <button
              type="button"
              className={trialAvailable ? "btn-ghost" : "btn-primary"}
              disabled={billingBusy || !stripeEnabled}
              onClick={() => void startCheckout(interval)}
              data-cta="household-checkout"
            >
              {billingBusy
                ? "Opening…"
                : !stripeEnabled
                  ? "Billing Unavailable"
                  : trialing
                    ? "Subscribe"
                    : trialAvailable
                      ? "Or Subscribe Now"
                      : "Get Household"}
            </button>
          )}
          {trialStarted ? null : (
            <button type="button" className="btn-ghost" onClick={closeUpgrade}>
              {isPaid ? "Close" : trialing ? "Not Yet" : "Keep Using Free"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function PlanSettingsCard() {
  const {
    isPaid: householdOn,
    trialing,
    trialDaysLeft,
    trialAvailable,
    planLabel: label,
    openUpgrade,
    openPortal,
    hasCustomer,
    stripeEnabled,
    billingBusy,
    billingError,
  } = usePlan();
  const isPaid = householdOn && !trialing;
  return (
    <Section id="settings-plan" title="Plan" actions={isPaid ? undefined : <HouseholdBadge />}>
      <p className="text-sm text-soft">
        {trialing ? (
          <>
            You’re on the <strong className="text-ink">Household trial</strong> — {trialDaysLeft} {trialDaysLeft === 1 ? "day" : "days"}{" "}
            left, then back to Free unless you subscribe.
          </>
        ) : (
          <>
            You’re on <strong className="text-ink">{label}</strong>
            {isPaid
              ? " — every widget, family tool and display refresh is unlocked."
              : ` — ${FREE_LIMITS.views} view, ${FREE_LIMITS.displays} displays, ${FREE_LIMITS.calendars} calendars, and the core widgets.`}
          </>
        )}
      </p>
      {billingError ? (
        <p className="text-sm text-bad" role="alert">
          {billingError}
        </p>
      ) : null}
      {inNativeApp() ? null : isPaid ? (
        hasCustomer ? (
          <button
            type="button"
            className="btn-ghost justify-self-start"
            disabled={billingBusy || !stripeEnabled}
            onClick={() => void openPortal()}
          >
            {billingBusy ? "Opening…" : "Manage Billing"}
          </button>
        ) : null
      ) : (
        <button type="button" className="btn-primary justify-self-start" onClick={() => openUpgrade("default")}>
          {trialing ? "Keep Household" : trialAvailable ? `Try Household Free for ${TRIAL_DAYS} Days` : "See Why Household"}
        </button>
      )}
    </Section>
  );
}

export function SaveNeedsUpgrade({ message }: { message: string }) {
  const { isPaid, openUpgrade } = usePlan();
  if (isPaid) return null;
  const looksLikePlan = /Household|upgrade|Free includes|needs Household/i.test(message) || message.toLowerCase().includes("upgrade");
  if (!looksLikePlan) return null;
  return (
    <button type="button" className="btn-primary shrink-0" onClick={() => openUpgrade("default")}>
      Upgrade
    </button>
  );
}
