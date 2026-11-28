"use client";

import { useSyncExternalStore, type ReactNode } from "react";

import { KidsChores } from "@/components/KidsChores";
import { MealPlanner } from "@/components/MealPlanner";
import { MessageBoard } from "@/components/MessageBoard";
import { ShoppingList } from "@/components/ShoppingList";
import { Mark } from "@/components/Wordmark";

// The family page and the kitchen edit page, one job at a time (Melvin, 2026-11-28: "do a pass over the edit screen
// for a family, seems a bit busy and not easy to use"). They used to be one 5,000-pixel scroll of the board, the
// calendar, the whiteboard, 21 meal boxes with 21 repeat menus, then the shopping list at the very bottom. Now a tab
// bar picks one: notes to the wall, shopping, meals, chores, and everything else under More. The bar sits at the
// bottom on a phone, where a thumb reaches, and under the header on a wider screen. The tab is the address's hash
// (#shopping), so Back works and a link can open a tab; the names match the app's own home. Only the open tab is
// mounted, so only its list loads.

export const FAMILY_TABS = ["notes", "shopping", "meals", "chores", "more"] as const;
export type FamilyTab = (typeof FAMILY_TABS)[number];

/** The tab an address hash names, or Notes. */
export function familyTabFromHash(hash: string): FamilyTab {
  const name = hash.replace(/^#/, "").toLowerCase();
  return (FAMILY_TABS as readonly string[]).includes(name) ? (name as FamilyTab) : "notes";
}

const LABELS: Record<FamilyTab, string> = { notes: "Notes", shopping: "Shopping", meals: "Meals", chores: "Chores", more: "More" };
const TITLES: Record<FamilyTab, string> = {
  notes: "Notes to the Wall",
  shopping: "Shopping List",
  meals: "Meal Plan",
  chores: "Chores",
  more: "More",
};

const subscribe = (fn: () => void) => {
  window.addEventListener("hashchange", fn);
  return () => window.removeEventListener("hashchange", fn);
};

export function FamilyHome({
  title,
  subtitle,
  actions,
  more,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** The rarer things: whiteboard, photos, the family calendar, this phone, the account. */
  more: ReactNode;
}) {
  const tab = useSyncExternalStore(
    subscribe,
    () => familyTabFromHash(window.location.hash),
    () => "notes" as FamilyTab,
  );
  const open = (t: FamilyTab) => {
    if (t === tab) return window.scrollTo({ top: 0, behavior: "smooth" });
    if (t === "notes") history.pushState(null, "", window.location.pathname + window.location.search);
    else history.pushState(null, "", `#${t}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-dvh">
      <header
        className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 pt-4"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <Mark size={32} />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">{title}</h1>
            {subtitle ? <p className="truncate text-sm text-soft">{subtitle}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 gap-2 whitespace-nowrap">{actions}</div> : null}
      </header>

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-panel sm:sticky sm:top-0 sm:bottom-auto sm:mt-3 sm:border-t-0 sm:border-b"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="mx-auto grid max-w-xl grid-cols-5 sm:px-2">
          {FAMILY_TABS.map((t) => (
            <li key={t}>
              <button
                type="button"
                aria-current={t === tab ? "page" : undefined}
                onClick={() => open(t)}
                className={`flex min-h-16 w-full flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors sm:min-h-12 sm:flex-row sm:gap-2 sm:text-sm ${
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

      <main className="mx-auto grid w-full max-w-xl gap-4 p-4 pb-28 sm:pb-10">
        {/* More is a stack of titled blocks, so it needs no title of its own. */}
        {tab !== "more" && <h2 className="text-lg font-bold">{TITLES[tab]}</h2>}
        {tab === "notes" && <MessageBoard />}
        {tab === "shopping" && <ShoppingList />}
        {tab === "meals" && <MealPlanner />}
        {tab === "chores" && <KidsChores />}
        {tab === "more" && <div className="grid gap-8">{more}</div>}
      </main>
    </div>
  );
}

/** A titled block on the More tab. */
export function MoreSection({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="grid gap-3" aria-labelledby={id}>
      <div className="grid gap-1">
        <h2 id={id} className="text-lg font-bold">
          {title}
        </h2>
        {hint ? <p className="text-sm text-soft">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function TabIcon({ tab }: { tab: FamilyTab }) {
  const common = {
    width: 22,
    height: 22,
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
