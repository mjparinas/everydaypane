"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { MealPlanner } from "@/components/MealPlanner";
import { MessageBoard } from "@/components/MessageBoard";
import { ShoppingList } from "@/components/ShoppingList";
import { Mark } from "@/components/Wordmark";
import type { DashboardConfig } from "@/lib/config/schema";
import type { PlanId } from "@/lib/plans";

import { DisplaysPanel } from "./DisplaysPanel";
import { FreePlanBanner, HouseholdBadge, HouseholdFeaturePrompt, PlanProvider, SaveNeedsUpgrade, UpgradeDialog, usePlan } from "./plan";
import { SchedulePanel } from "./SchedulePanel";
import { SettingsPanel } from "./SettingsPanel";
import { AdminProvider, useAdmin, useDirty } from "./store";
import { ThemesPanel } from "./ThemesPanel";
import { ViewsPanel } from "./ViewsPanel";

// The household panel: one page, with tabs, that works on a phone (Melvin, 2026-11-17; path /household/ 2026-11-23).
// Changes collect in a working copy and go out together with Save; Household displays long-poll for an instant reload,
// Free ones within ~30 seconds. Free users see soft Household CTAs (Melvin, 2026-11-23).

const TABS = [
  { id: "views", label: "Views", icon: "▦" },
  { id: "themes", label: "Colours", icon: "🎨" },
  { id: "schedule", label: "Schedule", icon: "🕒", household: true },
  { id: "displays", label: "Displays", icon: "🖥️" },
  { id: "messages", label: "Messages", icon: "💬", household: true },
  { id: "meals", label: "Meals", icon: "🍽️", household: true },
  { id: "shopping", label: "Shopping", icon: "🛒", household: true },
  { id: "settings", label: "Settings", icon: "⚙️" },
] as const;
type Tab = (typeof TABS)[number]["id"];

// The open tab lives in the address (#themes), so a reload or a shared link opens the same tab.
// Settings sections use #settings/photos (and so on) so widgets can deep-link into the right group.
const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const hashTab = (): Tab => {
  const h = window.location.hash.slice(1);
  if (h === "upgrade") return "views";
  const tabId = h.split("/")[0] ?? "";
  return TABS.find((t) => t.id === tabId)?.id ?? "views";
};

function SaveBar() {
  const status = useAdmin((s) => s.status);
  const save = useAdmin((s) => s.save);
  const reload = useAdmin((s) => s.reload);
  const discard = useAdmin((s) => s.discard);
  const clearConflict = useAdmin((s) => s.clearConflict);
  const dirty = useDirty();
  const { isPaid, openUpgrade } = usePlan();
  const [refreshNote, setRefreshNote] = useState("");

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const message =
    status.kind === "conflict" || status.kind === "invalid" || status.kind === "error"
      ? status.message
      : refreshNote
        ? refreshNote
        : status.kind === "saved" && !dirty
          ? isPaid
            ? "Saved. Displays update right away."
            : "Saved. Displays update within 30 seconds."
          : dirty
            ? "Unsaved changes"
            : "";

  async function refreshDisplays() {
    setRefreshNote("");
    const r = await fetch("/api/household/refresh/", { method: "POST" });
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    if (r.status === 402) {
      openUpgrade("refresh");
      setRefreshNote(body.error ?? "Instant refresh needs Household.");
      return;
    }
    setRefreshNote(r.ok ? "Told displays to reload." : (body.error ?? "Couldn't refresh displays."));
  }

  const showUpgradeCta = status.kind === "error" || status.kind === "invalid";

  return (
    <div className="flex min-w-0 items-center gap-2">
      <p
        className={`hidden min-w-0 truncate text-sm sm:block ${status.kind === "conflict" || status.kind === "invalid" || status.kind === "error" ? "text-bad" : "text-soft"}`}
        role="status"
      >
        {message}
      </p>
      {status.kind === "conflict" ? (
        <>
          <button className="btn-ghost" onClick={clearConflict}>
            Keep editing
          </button>
          <button className="btn-primary" onClick={() => void reload()}>
            Load their changes
          </button>
        </>
      ) : (
        <>
          {showUpgradeCta && status.message ? <SaveNeedsUpgrade message={status.message} /> : null}
          {isPaid && !dirty && (
            <button type="button" className="btn-ghost" onClick={() => void refreshDisplays()}>
              Refresh displays
            </button>
          )}
          {!isPaid && !dirty && (
            <button type="button" className="btn-ghost hidden text-soft lg:inline-flex" onClick={() => openUpgrade("refresh")}>
              Instant refresh
              <HouseholdBadge className="ml-1.5" />
            </button>
          )}
          {dirty && (
            <button className="btn-ghost" onClick={discard}>
              Undo all
            </button>
          )}
          <button className="btn-primary" disabled={!dirty || status.kind === "saving"} onClick={() => void save()}>
            {status.kind === "saving" ? "Saving…" : "Save"}
          </button>
        </>
      )}
    </div>
  );
}

function MobileStatus() {
  const status = useAdmin((s) => s.status);
  const { openUpgrade, isPaid } = usePlan();
  if (status.kind !== "conflict" && status.kind !== "invalid" && status.kind !== "error") return null;
  const upgrade = !isPaid && /Household|upgrade|Free includes|needs Household/i.test(status.message);
  return (
    <div className="mx-4 mt-3 rounded-xl bg-panel p-3 sm:hidden" role="alert">
      <p className="text-sm text-bad">{status.message}</p>
      {upgrade ? (
        <button type="button" className="btn-primary mt-2 w-full" onClick={() => openUpgrade("default")}>
          See Household
        </button>
      ) : null}
    </div>
  );
}

function PlanChip() {
  const { isPaid, planLabel, openUpgrade, openPortal, hasCustomer, loading } = usePlan();
  if (loading) return null;
  if (isPaid) {
    return (
      <button
        type="button"
        className="hidden rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-soft hover:text-ink sm:inline-flex"
        onClick={() => (hasCustomer ? void openPortal() : openUpgrade("default"))}
      >
        {planLabel}
      </button>
    );
  }
  return (
    <button
      type="button"
      className="hidden items-center gap-1.5 rounded-full border border-brand/30 bg-brand/5 px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand/10 sm:inline-flex"
      onClick={() => openUpgrade("default")}
    >
      Free
      <span className="text-brand/80">· Upgrade</span>
    </button>
  );
}

export function Admin({
  initial,
  version,
  email,
  staff = false,
  initialPlan = "free",
}: {
  initial: DashboardConfig;
  version: number;
  email: string;
  staff?: boolean;
  initialPlan?: PlanId;
}) {
  return (
    <AdminProvider config={initial} version={version}>
      <PlanProvider initialPlan={initialPlan}>
        <AdminPanel email={email} staff={staff} />
      </PlanProvider>
    </AdminProvider>
  );
}

function AdminPanel({ email, staff }: { email: string; staff: boolean }) {
  const name = useAdmin((s) => s.config.name);
  const tab = useSyncExternalStore(subscribeHash, hashTab, () => "views" as Tab);
  const { isPaid } = usePlan();
  const router = useRouter();

  function go(t: Tab) {
    // Keep a Settings deep link (#settings/chores) when the Settings tab is already open; otherwise open Dashboard.
    const next =
      t === "settings"
        ? tab === "settings" && /^#settings(\/|$)/.test(window.location.hash)
          ? window.location.hash
          : "#settings/dashboard"
        : `#${t}`;
    if (next !== window.location.hash) history.replaceState(null, "", next);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  async function signOut() {
    await fetch("/api/auth/signout/", { method: "POST" });
    // ClerkProvider mounts window.Clerk; revoke the browser session when present.
    const clerk = (window as unknown as { Clerk?: { signOut: (opts?: { redirectUrl?: string }) => Promise<void> } }).Clerk;
    if (clerk?.signOut) {
      await clerk.signOut({ redirectUrl: "/signin/" });
      return;
    }
    router.replace("/signin/");
  }

  return (
    <div className="min-h-dvh pb-24 md:pb-8">
      <header className="sticky top-0 z-20 border-b border-line bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <Mark size={36} />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold">{name}</h1>
              <p className="truncate text-xs text-soft">{email}</p>
            </div>
            <PlanChip />
          </div>
          <SaveBar />
        </div>
        <FreePlanBanner />
        <nav className="mx-auto hidden max-w-7xl gap-1 px-4 md:flex" aria-label="Sections">
          {TABS.map((t) => {
            const locked = Boolean("household" in t && t.household && !isPaid);
            return (
              <button
                key={t.id}
                className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
                  tab === t.id ? "border-brand text-ink" : "border-transparent text-soft hover:text-ink"
                } ${locked ? "opacity-70" : ""}`}
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => go(t.id)}
              >
                {t.label}
                {locked ? <HouseholdBadge /> : null}
              </button>
            );
          })}
          {staff && (
            <a className="ml-auto px-3 py-2 text-sm text-soft hover:text-ink" href="/admin/">
              Platform
            </a>
          )}
          <button className={`px-3 py-2 text-sm text-soft hover:text-ink ${staff ? "" : "ml-auto"}`} onClick={() => void signOut()}>
            Sign out
          </button>
        </nav>
      </header>
      <MobileStatus />

      <main className="mx-auto max-w-7xl p-4">
        {tab === "views" && <ViewsPanel />}
        {tab === "themes" && <ThemesPanel />}
        {tab === "schedule" &&
          (isPaid ? (
            <SchedulePanel />
          ) : (
            <HouseholdFeaturePrompt
              reason="schedule"
              title="Schedule through the day"
              blurb="Morning, afternoon, evening and overnight views, with sunrise or sunset starts — on Household."
            />
          ))}
        {tab === "displays" && <DisplaysPanel />}
        {tab === "messages" &&
          (isPaid ? (
            <div className="mx-auto max-w-3xl">
              <MessageBoard />
            </div>
          ) : (
            <HouseholdFeaturePrompt
              reason="messages"
              title="Family message board"
              blurb="Notes from phones show on the wall. Pin important ones — on Household."
            />
          ))}
        {tab === "meals" &&
          (isPaid ? (
            <MealPlanner />
          ) : (
            <HouseholdFeaturePrompt
              reason="meals"
              title="Meal planning"
              blurb="Breakfast, lunch and dinner for the week, planned from a phone and shown in the kitchen — on Household."
            />
          ))}
        {tab === "shopping" &&
          (isPaid ? (
            <div className="mx-auto max-w-xl">
              <ShoppingList />
            </div>
          ) : (
            <HouseholdFeaturePrompt
              reason="shopping"
              title="Shopping list"
              blurb="Groceries from phones, ticked off on the wall — on Household."
            />
          ))}
        {tab === "settings" && (
          <div className="grid gap-4">
            <SettingsPanel />
            <button className="btn-ghost justify-self-start md:hidden" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        )}
      </main>

      <UpgradeDialog />

      {/* A thumb-reachable tab bar on phones. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-8 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Sections"
      >
        {TABS.map((t) => {
          const locked = Boolean("household" in t && t.household && !isPaid);
          return (
            <button
              key={t.id}
              className={`grid min-h-14 min-w-0 place-items-center gap-0.5 px-0.5 text-[10px] font-medium leading-tight ${tab === t.id ? "text-brand" : "text-soft"} ${locked ? "opacity-70" : ""}`}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => go(t.id)}
            >
              <span aria-hidden="true" className="text-lg leading-none">
                {t.icon}
              </span>
              <span className="flex items-center gap-0.5 truncate">
                {t.label}
                {locked ? <span className="text-[8px] font-bold text-brand">H</span> : null}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
