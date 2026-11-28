"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { MealPlanner } from "@/components/MealPlanner";
import { MessageBoard } from "@/components/MessageBoard";
import { NativeAppBridge, signOutThisPhone } from "@/components/NativeApp";
import { ShoppingList } from "@/components/ShoppingList";
import { Bone } from "@/components/Skeleton";
import { Mark } from "@/components/Wordmark";
import type { DashboardConfig } from "@/lib/config/schema";
import type { PlanId } from "@/lib/plans";
import { signInHref } from "@/lib/site";

import { DisplaysPanel } from "./DisplaysPanel";
import { FlagsProvider } from "./flags";
import { TrialBanner } from "./GettingStarted";
import { HouseholdFeaturePrompt, PlanProvider, SaveNeedsUpgrade, UpgradeDialog, usePlan } from "./plan";
import { SchedulePanel } from "./SchedulePanel";
import { SettingsPanel } from "./SettingsPanel";
import { AdminProvider, useAdmin, useDirty } from "./store";
import { ThemesPanel } from "./ThemesPanel";
import { ViewsPanel } from "./ViewsPanel";

// The household panel: one page, with tabs, that works on a phone (Melvin, 2026-11-17; path /household/ 2026-11-23).
// Changes collect in a working copy and go out together with Publish to wall; Household displays long-poll for an
// instant reload, Free ones within ~30 seconds. Free users see soft Household CTAs (Melvin, 2026-11-23).
//
// Shared IA (critique fix 2026-11-24): five destinations on phone and desktop — Views, Colours, Displays, Family,
// Settings. Schedule / Meals / Shopping / Messages share Family with a sub-strip. Dirty Publish docks above the phone bar.

const PANEL_TABS = ["views", "themes", "schedule", "displays", "messages", "meals", "shopping", "settings"] as const;
type Tab = (typeof PANEL_TABS)[number];

const FAMILY_TABS = ["schedule", "messages", "meals", "shopping"] as const;
type FamilyTab = (typeof FAMILY_TABS)[number];

/** Same five destinations on desktop and phone (critique P2 layout). */
const MAIN_NAV = [
  { id: "views" as const, label: "Views", icon: "▦" },
  { id: "themes" as const, label: "Colours", icon: "🎨" },
  { id: "displays" as const, label: "Displays", icon: "🖥️" },
  { id: "family" as const, label: "Family", icon: "⌂" },
  { id: "settings" as const, label: "Settings", icon: "⚙️" },
];

const FAMILY_SUB: { id: FamilyTab; label: string }[] = [
  { id: "meals", label: "Meals" },
  { id: "shopping", label: "Shopping" },
  { id: "messages", label: "Messages" },
  { id: "schedule", label: "Schedule" },
];

function isFamilyTab(t: Tab): t is FamilyTab {
  return (FAMILY_TABS as readonly string[]).includes(t);
}

function isPanelTab(id: string): id is Tab {
  return (PANEL_TABS as readonly string[]).includes(id);
}

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
  // #family opens the Family hub on Meals (first everyday job).
  if (tabId === "family") return "meals";
  return isPanelTab(tabId) ? tabId : "views";
};

function SaveBar({ compact }: { compact?: boolean }) {
  const status = useAdmin((s) => s.status);
  const save = useAdmin((s) => s.save);
  const reload = useAdmin((s) => s.reload);
  const discard = useAdmin((s) => s.discard);
  const clearConflict = useAdmin((s) => s.clearConflict);
  const adoptVersion = useAdmin((s) => s.adoptVersion);
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
            ? "Published. Displays update right away."
            : "Published. Displays update within 30 seconds."
          : dirty
            ? "Wall settings · Unsaved"
            : "";

  async function refreshDisplays() {
    setRefreshNote("");
    const r = await fetch("/api/household/refresh/", { method: "POST" });
    const body = (await r.json().catch(() => ({}))) as { error?: string; version?: number };
    if (r.status === 402) {
      openUpgrade("refresh");
      setRefreshNote(body.error ?? "Instant refresh needs Household.");
      return;
    }
    // Refresh bumps the server version without changing the document; keep the working copy aligned so Publish
    // does not look like someone else saved (Melvin, 2026-11-24).
    if (r.ok && typeof body.version === "number") adoptVersion(body.version);
    setRefreshNote(r.ok ? "Told displays to reload." : (body.error ?? "Couldn't refresh displays."));
  }

  const showUpgradeCta = status.kind === "error" || status.kind === "invalid";

  return (
    <div className={`flex min-w-0 items-center gap-2 ${compact ? "w-full justify-between" : ""}`}>
      <p
        className={`min-w-0 truncate text-sm ${compact ? "flex-1" : "hidden sm:block"} ${
          status.kind === "conflict" || status.kind === "invalid" || status.kind === "error" ? "text-bad" : "text-soft"
        }`}
        role="status"
      >
        {message}
      </p>
      {status.kind === "conflict" ? (
        <>
          <button className="btn-ghost" onClick={() => void clearConflict()}>
            Keep Editing
          </button>
          <button className="btn-primary" onClick={() => void reload()}>
            Load Their Changes
          </button>
        </>
      ) : (
        <>
          {showUpgradeCta && status.message ? <SaveNeedsUpgrade message={status.message} /> : null}
          {isPaid && !dirty && (
            <button type="button" className="btn-ghost" onClick={() => void refreshDisplays()}>
              Refresh Displays
            </button>
          )}
          {dirty && (
            <button className="btn-ghost" onClick={discard}>
              Undo All
            </button>
          )}
          <button className="btn-primary" disabled={!dirty || status.kind === "saving"} onClick={() => void save()}>
            {status.kind === "saving" ? "Publishing…" : "Publish to Wall"}
          </button>
        </>
      )}
    </div>
  );
}

function MobileSaveDock() {
  const status = useAdmin((s) => s.status);
  const dirty = useDirty();
  // Thumb-reach Publish when there's something to do (or a conflict) — not for every idle visit.
  if (!dirty && status.kind !== "conflict" && status.kind !== "saving" && status.kind !== "error" && status.kind !== "invalid") {
    return null;
  }
  return (
    <div className="fixed inset-x-0 bottom-14 z-[21] border-t border-line bg-panel px-3 py-2 md:hidden">
      <SaveBar compact />
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
  const { isPaid, planLabel, openUpgrade, openPortal, hasCustomer, loading, trialing, trialDaysLeft } = usePlan();
  // Hold the chip's place while the plan loads, so the header doesn't shift when it appears.
  if (loading) return <Bone className={`h-6 w-12 rounded-full ${isPaid ? "max-sm:hidden" : ""}`} />;
  if (trialing) {
    // The trial's days left live here all trial long (Melvin, 2026-11-28); the banner only joins in the last four.
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand"
        onClick={() => openUpgrade("default")}
        aria-label={`Household trial, ${trialDaysLeft} days left`}
      >
        Trial · {trialDaysLeft} {trialDaysLeft === 1 ? "Day" : "Days"} Left
      </button>
    );
  }
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
      className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-soft hover:border-brand/40 hover:text-brand"
      onClick={() => openUpgrade("default")}
      aria-label="Free plan — see Household"
    >
      Free
    </button>
  );
}

function FamilySubNav({ active, onGo }: { active: FamilyTab; onGo: (t: FamilyTab) => void }) {
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto" role="tablist" aria-label="Family">
      {FAMILY_SUB.map((s) => (
        <button
          key={s.id}
          type="button"
          role="tab"
          aria-selected={active === s.id}
          className={`shrink-0 ${active === s.id ? "btn-primary" : "btn-ghost"}`}
          onClick={() => onGo(s.id)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

function FamilyPersistenceHint() {
  return (
    <p className="mb-3 rounded-xl border border-line bg-bg px-3 py-2 text-sm text-soft md:mb-4" role="note">
      Family lists are live — meals, shopping and messages save as you go. Wall settings (Views, Colours, Settings) need{" "}
      <span className="font-semibold text-ink">Publish to wall</span>.
    </p>
  );
}

export function Admin({
  initial,
  version,
  email,
  personName,
  staff = false,
  initialPlan = "free",
  flagsOff = [],
  unconfigured = [],
}: {
  initial: DashboardConfig;
  version: number;
  email: string;
  /** The signed-in person's name from their profile; the email shows only when there is none (Melvin, 2026-11-27). */
  personName?: string | undefined;
  staff?: boolean;
  initialPlan?: PlanId;
  /** Platform feature flags that are off for this household (Melvin, 2026-11-26). */
  flagsOff?: readonly string[];
  /** Widgets and providers whose Everydaypane API key is missing on this deploy (Melvin, 2026-11-26). */
  unconfigured?: readonly string[];
}) {
  return (
    <AdminProvider config={initial} version={version}>
      <PlanProvider initialPlan={initialPlan}>
        <FlagsProvider off={flagsOff} unconfigured={unconfigured}>
          <AdminPanel email={email} personName={personName} staff={staff} />
        </FlagsProvider>
      </PlanProvider>
    </AdminProvider>
  );
}

function AdminPanel({ email, personName, staff }: { email: string; personName?: string | undefined; staff: boolean }) {
  const name = useAdmin((s) => s.config.name);
  const tab = useSyncExternalStore(subscribeHash, hashTab, () => "views" as Tab);
  const dirty = useDirty();
  const status = useAdmin((s) => s.status);
  const { isPaid } = usePlan();
  const router = useRouter();
  const familyActive = isFamilyTab(tab);
  const dockUp = dirty || status.kind === "conflict" || status.kind === "saving" || status.kind === "error" || status.kind === "invalid";

  function go(t: Tab | "family") {
    const next =
      t === "settings"
        ? tab === "settings" && /^#settings(\/|$)/.test(window.location.hash)
          ? window.location.hash
          : "#settings/dashboard"
        : t === "family"
          ? "#meals"
          : `#${t}`;
    if (next !== window.location.hash) history.replaceState(null, "", next);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  async function signOut() {
    await signOutThisPhone();
    await fetch("/api/auth/signout/", { method: "POST" });
    // ClerkProvider mounts window.Clerk; revoke the browser session when present.
    const clerk = (window as unknown as { Clerk?: { signOut: (opts?: { redirectUrl?: string }) => Promise<void> } }).Clerk;
    if (clerk?.signOut) {
      await clerk.signOut({ redirectUrl: signInHref() });
      return;
    }
    router.replace(signInHref());
  }

  return (
    <div className={`min-h-dvh md:pb-8 ${dockUp ? "pb-36" : "pb-24"}`}>
      <NativeAppBridge />
      <header className="sticky top-0 z-20 border-b border-line bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <Mark size={36} />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold">{name}</h1>
              <p className="truncate text-xs text-soft" title={email}>
                {personName || email}
              </p>
            </div>
            <PlanChip />
          </div>
          <div className="hidden sm:block">
            <SaveBar />
          </div>
        </div>
        <nav className="mx-auto hidden max-w-7xl gap-1 px-4 md:flex" aria-label="Sections">
          {MAIN_NAV.map((t) => {
            const on = t.id === "family" ? familyActive : tab === t.id;
            return (
              <button
                key={t.id}
                className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
                  on ? "border-brand text-ink" : "border-transparent text-soft hover:text-ink"
                }`}
                aria-current={on ? "page" : undefined}
                onClick={() => go(t.id === "family" ? "family" : t.id)}
              >
                {t.label}
              </button>
            );
          })}
          {staff && (
            <a className="ml-auto px-3 py-2 text-sm text-soft hover:text-ink" href="/admin/">
              Platform
            </a>
          )}
          <button className={`px-3 py-2 text-sm text-soft hover:text-ink ${staff ? "" : "ml-auto"}`} onClick={() => void signOut()}>
            Sign Out
          </button>
        </nav>
      </header>
      <TrialBanner />
      <MobileStatus />

      <main className="mx-auto max-w-7xl p-4">
        {familyActive ? <FamilySubNav active={tab} onGo={(t) => go(t)} /> : null}
        {tab === "views" && <ViewsPanel />}
        {tab === "themes" && <ThemesPanel />}
        {tab === "schedule" &&
          (isPaid ? (
            <SchedulePanel />
          ) : (
            <HouseholdFeaturePrompt
              reason="schedule"
              title="Schedule Through the Day"
              blurb="Morning, afternoon, evening and overnight views, with sunrise or sunset starts — on Household."
            />
          ))}
        {tab === "displays" && <DisplaysPanel />}
        {tab === "messages" &&
          (isPaid ? (
            <div className="mx-auto max-w-3xl">
              <FamilyPersistenceHint />
              <MessageBoard />
            </div>
          ) : (
            <HouseholdFeaturePrompt
              reason="messages"
              title="Family Message Board"
              blurb="Notes from phones show on the wall. Pin important ones — on Household."
            />
          ))}
        {tab === "meals" &&
          (isPaid ? (
            <>
              <FamilyPersistenceHint />
              <MealPlanner />
            </>
          ) : (
            <HouseholdFeaturePrompt
              reason="meals"
              title="Meal Planning"
              blurb="Breakfast, lunch and dinner for the week, planned from a phone and shown in the kitchen — on Household."
            />
          ))}
        {tab === "shopping" &&
          (isPaid ? (
            <div className="mx-auto max-w-xl">
              <FamilyPersistenceHint />
              <ShoppingList />
            </div>
          ) : (
            <HouseholdFeaturePrompt
              reason="shopping"
              title="Shopping List"
              blurb="Groceries from phones, ticked off on the wall — on Household."
            />
          ))}
        {tab === "settings" && (
          <div className="grid gap-4">
            <SettingsPanel />
            <button className="btn-ghost justify-self-start md:hidden" onClick={() => void signOut()}>
              Sign Out
            </button>
          </div>
        )}
      </main>

      <UpgradeDialog />
      <MobileSaveDock />

      {/* Five thumb destinations; Family holds meals / shopping / messages / schedule. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Sections"
      >
        {MAIN_NAV.map((t) => {
          const on = t.id === "family" ? familyActive : tab === t.id;
          return (
            <button
              key={t.id}
              className={`grid min-h-14 min-w-0 place-items-center gap-0.5 px-1 text-xs font-medium leading-tight ${
                on ? "text-brand" : "text-soft"
              }`}
              aria-current={on ? "page" : undefined}
              onClick={() => go(t.id === "family" ? "family" : t.id)}
            >
              <span aria-hidden="true" className="text-lg leading-none">
                {t.icon}
              </span>
              <span className="truncate">{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
