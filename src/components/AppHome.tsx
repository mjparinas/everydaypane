"use client";

import { useSyncExternalStore, type ReactNode } from "react";

import { SignOut } from "@/app/family/SignOut";
import { DeleteAccount } from "@/components/DeleteAccount";
import { FamilyEvents } from "@/components/FamilyEvents";
import { FamilyPhotos } from "@/components/FamilyPhotos";
import { InstallPrompt } from "@/components/InstallPrompt";
import { KidsChores } from "@/components/KidsChores";
import { MealPlanner } from "@/components/MealPlanner";
import { MessageBoard } from "@/components/MessageBoard";
import { NativeAppBridge, ThisPhoneCard } from "@/components/NativeApp";
import { ShoppingList } from "@/components/ShoppingList";
import { Whiteboard } from "@/components/Whiteboard";
import { Mark } from "@/components/Wordmark";

// The app's home (Melvin, 2026-11-28: "the mobile app should prioritize sending messages to the wall, editing todo
// lists, shopping cart, etc, basically anything on the edit screen. make it an easy and intuitive interface"). One
// thing at a time with a thumb-reachable tab bar, in the order a family reaches for them: a note to the wall first,
// then the shopping list, meals and chores; the whiteboard, photos, the family calendar and this phone's settings sit
// under More, and Household is one tap away for admins. The tab lives in the address's hash (#shopping), so Back and
// a link from a notification or widget land on the right one. Only the open tab is mounted, so only its list polls.

export const APP_TABS = ["notes", "shopping", "meals", "chores", "more"] as const;
export type AppTab = (typeof APP_TABS)[number];

/** The tab an address hash names, or Notes. */
export function tabFromHash(hash: string): AppTab {
  const name = hash.replace(/^#/, "").toLowerCase();
  return (APP_TABS as readonly string[]).includes(name) ? (name as AppTab) : "notes";
}

const subscribe = (fn: () => void) => {
  window.addEventListener("hashchange", fn);
  return () => window.removeEventListener("hashchange", fn);
};

const TITLES: Record<AppTab, string> = {
  notes: "Notes to the Wall",
  shopping: "Shopping List",
  meals: "Meal Plan",
  chores: "Chores",
  more: "More",
};

export function AppHome({ isAdmin, name }: { isAdmin: boolean; name: string | null }) {
  const tab = useSyncExternalStore(
    subscribe,
    () => tabFromHash(window.location.hash),
    () => "notes" as AppTab,
  );
  const open = (t: AppTab) => {
    if (t === tab) return window.scrollTo({ top: 0, behavior: "smooth" });
    window.location.hash = t === "notes" ? "" : t;
    // An empty hash leaves a bare "#"; tidy it without adding another history entry.
    if (t === "notes") history.replaceState(null, "", window.location.pathname + window.location.search);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-dvh bg-bg">
      <NativeAppBridge />
      <header
        className="sticky top-0 z-10 border-b border-line bg-panel/95 px-4 pb-3 backdrop-blur"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Mark size={32} />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold">{TITLES[tab]}</h1>
              {tab === "notes" && name ? <p className="truncate text-sm text-soft">Hi, {name}</p> : null}
            </div>
          </div>
          {isAdmin ? (
            <a className="btn-ghost shrink-0 px-3 text-sm" href="/household/">
              Household
            </a>
          ) : null}
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-xl gap-4 p-4" style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}>
        {tab === "notes" && (
          <>
            <QuickActions open={open} />
            <MessageBoard />
          </>
        )}
        {tab === "shopping" && <ShoppingList />}
        {tab === "meals" && <MealPlanner />}
        {tab === "chores" && <KidsChores />}
        {tab === "more" && <More isAdmin={isAdmin} />}
      </main>

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-panel/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="mx-auto grid max-w-xl grid-cols-5">
          {APP_TABS.map((t) => (
            <li key={t}>
              <button
                type="button"
                aria-current={t === tab ? "page" : undefined}
                onClick={() => open(t)}
                className={`flex min-h-16 w-full flex-col items-center justify-center gap-1 text-xs font-semibold transition ${
                  t === tab ? "text-brand" : "text-soft hover:text-ink"
                }`}
              >
                <TabIcon tab={t} />
                {LABELS[t]}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

const LABELS: Record<AppTab, string> = { notes: "Notes", shopping: "Shopping", meals: "Meals", chores: "Chores", more: "More" };

/** The three things people open the app for most, as big buttons above the note form. */
function QuickActions({ open }: { open: (t: AppTab) => void }) {
  const actions: { tab: AppTab; label: string; hint: string }[] = [
    { tab: "shopping", label: "Add to Shopping", hint: "Milk, eggs, bread" },
    { tab: "meals", label: "Plan Dinner", hint: "This week's meals" },
    { tab: "chores", label: "Tick Off Chores", hint: "Today's list" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {actions.map((a) => (
        <button
          key={a.tab}
          type="button"
          onClick={() => open(a.tab)}
          className="grid min-h-24 content-center justify-items-center gap-1.5 rounded-2xl border border-line bg-panel p-3 text-center transition active:scale-[0.98]"
        >
          <span className="grid h-10 w-10 place-items-center rounded-full bg-brand/10 text-brand">
            <TabIcon tab={a.tab} />
          </span>
          <span className="text-sm leading-tight font-semibold">{a.label}</span>
          <span className="sr-only">{a.hint}</span>
        </button>
      ))}
    </div>
  );
}

function More({ isAdmin }: { isAdmin: boolean }) {
  return (
    <>
      <Section id="more-whiteboard" title="Whiteboard">
        <Whiteboard />
      </Section>
      <FamilyPhotos />
      <Section id="more-calendar" title="Family Calendar">
        <FamilyEvents />
      </Section>
      <ThisPhoneCard />
      <InstallPrompt />
      <Section id="more-account" title="Account">
        <div className="flex flex-wrap gap-2">
          {isAdmin ? (
            <a className="btn-ghost" href="/household/">
              Household Settings
            </a>
          ) : null}
          <a className="btn-ghost" href="/family/">
            Everything on One Page
          </a>
          <SignOut />
        </div>
      </Section>
      <DeleteAccount />
    </>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3" aria-labelledby={id}>
      <h2 id={id} className="text-lg font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function TabIcon({ tab }: { tab: AppTab }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (tab) {
    case "notes":
      return (
        <svg {...common}>
          <path d="M4 5h16v11H8l-4 4z" />
          <path d="M8 9h8M8 12h5" />
        </svg>
      );
    case "shopping":
      return (
        <svg {...common}>
          <path d="M5 8h14l-1.2 11H6.2z" />
          <path d="M9 8V6a3 3 0 0 1 6 0v2" />
        </svg>
      );
    case "meals":
      return (
        <svg {...common}>
          <path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10" />
          <path d="M17 21V3c-2 1-3 4-3 7h3" />
        </svg>
      );
    case "chores":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="m8.5 12 2.5 2.5 4.5-5" />
        </svg>
      );
    case "more":
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1.2" />
          <circle cx="12" cy="12" r="1.2" />
          <circle cx="19" cy="12" r="1.2" />
        </svg>
      );
  }
}
