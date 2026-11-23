"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { MealPlanner } from "@/components/MealPlanner";
import { MessageBoard } from "@/components/MessageBoard";
import { ShoppingList } from "@/components/ShoppingList";
import { Mark } from "@/components/Wordmark";
import type { DashboardConfig } from "@/lib/config/schema";

import { DisplaysPanel } from "./DisplaysPanel";
import { SchedulePanel } from "./SchedulePanel";
import { SettingsPanel } from "./SettingsPanel";
import { AdminProvider, useAdmin, useDirty } from "./store";
import { ThemesPanel } from "./ThemesPanel";
import { ViewsPanel } from "./ViewsPanel";

// The household panel: one page, with tabs, that works on a phone (Melvin, 2026-11-17; path /household/ 2026-11-23).
// Changes collect in a working copy and go out together with Save; Household displays long-poll for an instant reload,
// Free ones within ~30 seconds.

const TABS = [
  { id: "views", label: "Views", icon: "▦" },
  { id: "themes", label: "Colours", icon: "🎨" },
  { id: "schedule", label: "Schedule", icon: "🕒" },
  { id: "displays", label: "Displays", icon: "🖥️" },
  { id: "messages", label: "Messages", icon: "💬" },
  { id: "meals", label: "Meals", icon: "🍽️" },
  { id: "shopping", label: "Shopping", icon: "🛒" },
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
  const [instant, setInstant] = useState(false);
  const [refreshNote, setRefreshNote] = useState("");

  useEffect(() => {
    let live = true;
    fetch("/api/household/billing/")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { plan?: string } | null) => {
        if (live && body?.plan === "paid") setInstant(true);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

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
          ? instant
            ? "Saved. Displays update right away."
            : "Saved. Displays update within 30 seconds."
          : dirty
            ? "Unsaved changes"
            : "";

  async function refreshDisplays() {
    setRefreshNote("");
    const r = await fetch("/api/household/refresh/", { method: "POST" });
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    setRefreshNote(r.ok ? "Told displays to reload." : (body.error ?? "Couldn't refresh displays."));
  }

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
          {instant && !dirty && (
            <button type="button" className="btn-ghost" onClick={() => void refreshDisplays()}>
              Refresh displays
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
  if (status.kind !== "conflict" && status.kind !== "invalid" && status.kind !== "error") return null;
  return (
    <p className="mx-4 mt-3 rounded-xl bg-panel p-3 text-sm text-bad sm:hidden" role="alert">
      {status.message}
    </p>
  );
}

export function Admin({
  initial,
  version,
  email,
  staff = false,
}: {
  initial: DashboardConfig;
  version: number;
  email: string;
  staff?: boolean;
}) {
  return (
    <AdminProvider config={initial} version={version}>
      <AdminPanel email={email} staff={staff} />
    </AdminProvider>
  );
}

function AdminPanel({ email, staff }: { email: string; staff: boolean }) {
  const name = useAdmin((s) => s.config.name);
  const tab = useSyncExternalStore(subscribeHash, hashTab, () => "views" as Tab);
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
          </div>
          <SaveBar />
        </div>
        <nav className="mx-auto hidden max-w-7xl gap-1 px-4 md:flex" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`border-b-2 px-3 py-2 text-sm font-medium ${tab === t.id ? "border-brand text-ink" : "border-transparent text-soft hover:text-ink"}`}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => go(t.id)}
            >
              {t.label}
            </button>
          ))}
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
        {tab === "schedule" && <SchedulePanel />}
        {tab === "displays" && <DisplaysPanel />}
        {tab === "messages" && (
          <div className="mx-auto max-w-3xl">
            <MessageBoard />
          </div>
        )}
        {tab === "meals" && <MealPlanner />}
        {tab === "shopping" && (
          <div className="mx-auto max-w-xl">
            <ShoppingList />
          </div>
        )}
        {tab === "settings" && (
          <div className="grid gap-4">
            <SettingsPanel />
            <button className="btn-ghost justify-self-start md:hidden" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        )}
      </main>

      {/* A thumb-reachable tab bar on phones. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-8 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Sections"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`grid min-h-14 min-w-0 place-items-center gap-0.5 px-0.5 text-[10px] font-medium leading-tight ${tab === t.id ? "text-brand" : "text-soft"}`}
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => go(t.id)}
          >
            <span aria-hidden="true" className="text-lg leading-none">
              {t.icon}
            </span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
