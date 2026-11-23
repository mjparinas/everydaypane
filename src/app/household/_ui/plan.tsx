"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { MARKETING_PLANS, usd } from "@/lib/marketingPlans";
import { FREE_LIMITS, PAID_LIMITS, planLabel, UPGRADE_REASONS, type PlanId, type UpgradeReasonKey } from "@/lib/plans";

import { Section } from "./fields";

// Soft Free → Household upgrade UX (Melvin, 2026-11-23): badges and greyed controls that open an in-app
// upgrade screen, with quiet CTAs so Free stays usable for clocks, weather, photos and calendars.

type BillingBody = {
  plan?: PlanId;
  planLabel?: string;
  stripeEnabled?: boolean;
  hasCustomer?: boolean;
};

export type PlanContextValue = {
  plan: PlanId;
  planLabel: string;
  stripeEnabled: boolean;
  hasCustomer: boolean;
  loading: boolean;
  isPaid: boolean;
  upgradeOpen: boolean;
  upgradeReason: UpgradeReasonKey;
  openUpgrade: (reason?: UpgradeReasonKey) => void;
  closeUpgrade: () => void;
  refresh: () => Promise<void>;
  startCheckout: () => Promise<void>;
  openPortal: () => Promise<void>;
  billingBusy: boolean;
  billingError: string;
};

const PlanContext = createContext<PlanContextValue | null>(null);

const BANNER_DISMISS_KEY = "everydaypane.freeBanner.dismissed";

export function PlanProvider({ children, initialPlan = "free" }: { children: ReactNode; initialPlan?: PlanId }) {
  const [plan, setPlan] = useState<PlanId>(initialPlan);
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [hasCustomer, setHasCustomer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [upgradeOpen, setUpgradeOpen] = useState(() => typeof window !== "undefined" && window.location.hash === "#upgrade");
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReasonKey>("default");
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState("");

  const apply = useCallback((body: BillingBody | null) => {
    if (!body?.plan) return;
    setPlan(body.plan === "paid" ? "paid" : "free");
    setStripeEnabled(Boolean(body.stripeEnabled));
    setHasCustomer(Boolean(body.hasCustomer));
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
      history.replaceState(null, "", "#upgrade");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  }, []);

  const closeUpgrade = useCallback(() => {
    setUpgradeOpen(false);
    if (window.location.hash === "#upgrade") {
      history.replaceState(null, "", "#views");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  }, []);

  const startCheckout = useCallback(async () => {
    setBillingBusy(true);
    setBillingError("");
    try {
      const r = await fetch("/api/household/billing/?action=checkout", { method: "POST" });
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
      hasCustomer,
      loading,
      isPaid: plan === "paid",
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
      hasCustomer,
      loading,
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
      className={`inline-flex items-center rounded-md bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand ${className}`}
    >
      Household
    </span>
  );
}

export function FreePlanBanner() {
  const { isPaid, openUpgrade, loading } = usePlan();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return sessionStorage.getItem(BANNER_DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (loading || isPaid || dismissed) return null;

  return (
    <div className="border-b border-brand/20 bg-brand/5" role="region" aria-label="Household plan">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2.5">
        <p className="min-w-0 flex-1 text-sm text-ink">
          You’re on <strong>Free</strong> — clocks, weather, photos and calendars work.{" "}
          <span className="text-soft">Household adds meals, chores, smart home and every widget.</span>
        </p>
        <button type="button" className="btn-primary shrink-0" onClick={() => openUpgrade("default")}>
          See Household
        </button>
        <button
          type="button"
          className="btn-ghost shrink-0 text-soft"
          aria-label="Dismiss"
          onClick={() => {
            try {
              sessionStorage.setItem(BANNER_DISMISS_KEY, "1");
            } catch {
              // ignore
            }
            setDismissed(true);
          }}
        >
          Not now
        </button>
      </div>
    </div>
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
  const { openUpgrade } = usePlan();
  return (
    <div className="mx-auto grid max-w-lg gap-4 py-8 text-center">
      <div className="flex justify-center">
        <HouseholdBadge />
      </div>
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="text-soft">{blurb}</p>
      <p className="text-sm text-soft">{UPGRADE_REASONS[reason]}</p>
      <button type="button" className="btn-primary justify-self-center" onClick={() => openUpgrade(reason)}>
        Why upgrade
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
  const { isPaid, openUpgrade } = usePlan();
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
          <span className="text-xs text-soft">Tap to see what’s included</span>
        </span>
      </button>
    </div>
  );
}

export function UpgradeDialog() {
  const {
    isPaid,
    upgradeOpen,
    upgradeReason,
    closeUpgrade,
    startCheckout,
    openPortal,
    hasCustomer,
    stripeEnabled,
    billingBusy,
    billingError,
  } = usePlan();

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
              {isPaid ? "You’re on Household" : "Upgrade to Household"}
            </h2>
            <p className="mt-1 text-sm text-soft">{isPaid ? "Thanks — every widget and family tool is unlocked." : reason}</p>
          </div>
          <button type="button" className="btn-ghost min-h-9 shrink-0 px-3" onClick={closeUpgrade} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="grid flex-1 gap-4 overflow-y-auto px-5 py-4">
          {!isPaid && (
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
              <div className="rounded-2xl bg-bg p-4 text-sm">
                <p className="font-semibold">
                  {usd(paid.priceYearly)} / year <span className="font-normal text-soft">· about {usd(paid.priceYearly / 12)} / month</span>
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
          {isPaid ? (
            hasCustomer ? (
              <button type="button" className="btn-primary" disabled={billingBusy || !stripeEnabled} onClick={() => void openPortal()}>
                {billingBusy ? "Opening…" : "Manage billing"}
              </button>
            ) : (
              <button type="button" className="btn-primary" onClick={closeUpgrade}>
                Continue
              </button>
            )
          ) : (
            <button
              type="button"
              className="btn-primary"
              disabled={billingBusy || !stripeEnabled}
              onClick={() => void startCheckout()}
              data-cta="household-checkout"
            >
              {billingBusy ? "Opening…" : stripeEnabled ? "Get Household" : "Billing unavailable"}
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={closeUpgrade}>
            {isPaid ? "Close" : "Keep using Free"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PlanSettingsCard() {
  const { isPaid, planLabel: label, openUpgrade, openPortal, hasCustomer, stripeEnabled, billingBusy, billingError } = usePlan();
  return (
    <Section id="settings-plan" title="Plan" actions={isPaid ? undefined : <HouseholdBadge />}>
      <p className="text-sm text-soft">
        You’re on <strong className="text-ink">{label}</strong>
        {isPaid
          ? " — every widget, family tool and display refresh is unlocked."
          : ` — ${FREE_LIMITS.views} view, ${FREE_LIMITS.displays} displays, ${FREE_LIMITS.calendars} calendars, and the core widgets.`}
      </p>
      {billingError ? (
        <p className="text-sm text-bad" role="alert">
          {billingError}
        </p>
      ) : null}
      {isPaid ? (
        hasCustomer ? (
          <button
            type="button"
            className="btn-ghost justify-self-start"
            disabled={billingBusy || !stripeEnabled}
            onClick={() => void openPortal()}
          >
            {billingBusy ? "Opening…" : "Manage billing"}
          </button>
        ) : null
      ) : (
        <button type="button" className="btn-primary justify-self-start" onClick={() => openUpgrade("default")}>
          See why Household
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
