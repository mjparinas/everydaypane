"use client";

import type { ReactNode } from "react";

import { BuildStamp } from "@/components/site/BuildStamp";
import { Mark } from "@/components/Wordmark";
import { ADMIN_TAB_GROUPS, adminGroupFor, adminTabLabel, type AdminTab } from "@/lib/adminTabs";

export function AdminBrand({ as: Tag = "h1" }: { as?: "h1" | "div" }) {
  return (
    <Tag className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-ink">
      <Mark size={28} />
      <span>
        Everydaypane{" "}
        <span className="ml-0.5 rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 align-middle text-xs font-bold uppercase tracking-[0.12em] text-brand">
          admin
        </span>
      </span>
    </Tag>
  );
}

function NavItem({ tab, on, badge, onClick, dense }: { tab: AdminTab; on: boolean; badge?: number; onClick: () => void; dense?: boolean }) {
  const label = adminTabLabel(tab);
  return (
    <li className={dense ? "shrink-0" : "w-full"}>
      <button
        type="button"
        aria-current={on ? "page" : undefined}
        onClick={onClick}
        className={`flex items-center gap-2 rounded-lg px-3 font-semibold transition-colors ${
          dense ? "min-h-11 text-sm" : "min-h-8 w-full py-1.5 text-left text-[0.8125rem]"
        } ${on ? "bg-brand/10 text-ink" : "text-soft hover:bg-bg hover:text-ink"}`}
      >
        <span className={dense ? "" : "flex-1"}>{label}</span>
        {badge ? (
          <span className="rounded-full bg-brand px-1.5 text-xs font-bold text-brand-ink tabular-nums" aria-label={`${badge} waiting`}>
            {badge}
          </span>
        ) : null}
      </button>
    </li>
  );
}

function StaffMeta({ staff, onSignOut, compact }: { staff?: { email: string; role: string }; onSignOut?: () => void; compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? "flex max-w-[11rem] flex-col items-end gap-0.5 text-[0.7rem] text-soft"
          : "flex flex-col items-stretch gap-1.5 border-t border-line px-1.5 pt-3 text-[0.7rem] text-soft"
      }
    >
      {staff && (
        <span className={`min-w-0 ${compact ? "truncate" : "break-all"}`}>
          {staff.email} <span className="rounded-full bg-bg px-1.5 py-0.5 text-[0.65rem] font-semibold capitalize">{staff.role}</span>
        </span>
      )}
      <span className={`flex flex-wrap gap-x-2 ${compact ? "justify-end" : ""}`}>
        <a className="underline hover:text-ink" href="/household/">
          My household
        </a>
        {onSignOut && (
          <button type="button" className="underline hover:text-ink" onClick={onSignOut}>
            Sign out
          </button>
        )}
      </span>
      {!compact && <BuildStamp />}
    </div>
  );
}

function groupWaiting(tabs: readonly AdminTab[], badges: Partial<Record<string, number>>): number {
  return tabs.reduce((n, t) => n + (badges[t] ?? 0), 0);
}

export function AdminShell({
  tab,
  onTab,
  badges = {},
  staff,
  onSignOut,
  tools,
  children,
}: {
  tab: AdminTab;
  onTab?: (t: AdminTab) => void;
  badges?: Partial<Record<string, number>>;
  staff?: { email: string; role: string };
  onSignOut?: () => void;
  tools?: ReactNode;
  children: ReactNode;
}) {
  const activeGroup = adminGroupFor(tab);

  return (
    <div className="min-h-dvh bg-bg">
      {/*
        Ops cockpit: mobile = sticky brand + 4 group rails + horizontal tabs in the active group
        (no 16-chip wrap). Desktop = dense fixed sidebar with group labels; staff meta at the foot.
      */}
      <aside className="sticky top-0 z-30 border-b border-line bg-bg px-3 pt-3 pb-2 lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-56 lg:flex-col lg:gap-3 lg:overflow-y-auto lg:border-r lg:border-b-0 lg:bg-panel lg:px-2.5 lg:py-4">
        <div className="flex items-start justify-between gap-3 lg:block lg:px-1.5">
          <AdminBrand />
          <div className="lg:hidden">
            <StaffMeta staff={staff} onSignOut={onSignOut} compact />
          </div>
        </div>

        <nav className="mt-3 lg:hidden" aria-label="Sections">
          <div className="flex rounded-lg border border-line bg-panel p-0.5" role="tablist" aria-label="Section groups">
            {ADMIN_TAB_GROUPS.map((g) => {
              const on = g.label === activeGroup.label;
              const waiting = groupWaiting(g.tabs, badges);
              return (
                <button
                  key={g.label}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  className={`relative min-h-10 flex-1 rounded-md px-1 text-[0.7rem] font-bold tracking-wide uppercase ${
                    on ? "bg-brand text-brand-ink" : "text-soft"
                  }`}
                  onClick={() => {
                    if (!g.tabs.includes(tab)) onTab?.(g.tabs[0]!);
                  }}
                >
                  {g.label}
                  {waiting > 0 ? (
                    <span className="absolute -top-1 -right-0.5 min-w-[1.1rem] rounded-full bg-ink px-1 text-[0.65rem] font-bold text-bg tabular-nums">
                      {waiting}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <ul className="-mx-1 mt-2 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {activeGroup.tabs.map((t) => (
              <NavItem key={t} tab={t} on={tab === t} badge={badges[t]} dense onClick={() => onTab?.(t)} />
            ))}
          </ul>
        </nav>

        <nav className="mt-1 hidden min-h-0 flex-1 lg:block" aria-label="Sections">
          {ADMIN_TAB_GROUPS.map((g) => (
            <div key={g.label} className="mb-2.5">
              <div className="px-2.5 pb-1 text-[0.65rem] font-bold tracking-[0.14em] text-soft uppercase">{g.label}</div>
              <ul className="flex flex-col gap-0.5">
                {g.tabs.map((t) => (
                  <NavItem key={t} tab={t} on={tab === t} badge={badges[t]} onClick={() => onTab?.(t)} />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mt-auto hidden lg:block">
          <StaffMeta staff={staff} onSignOut={onSignOut} />
        </div>
      </aside>

      <div className="lg:pl-56">
        <div className="mx-auto max-w-6xl px-4 pb-16">
          <header className="z-20 -mx-4 border-b border-line bg-bg px-4 pt-3 pb-3 lg:sticky lg:top-0 lg:pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="mr-auto text-xl font-extrabold tracking-tight">{adminTabLabel(tab)}</h2>
              {tools}
            </div>
          </header>
          {children}
        </div>
      </div>
    </div>
  );
}

export function AdminAuthCard({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-bg px-5 py-16">
      <div className="w-full max-w-md">
        <AdminBrand as="div" />
        <div className="card mt-6 p-6">
          <h1 className="text-xl font-extrabold tracking-tight">{title}</h1>
          {sub && <div className="mt-1 text-sm text-soft">{sub}</div>}
          <div className="mt-5">{children}</div>
        </div>
        <BuildStamp className="mt-4 block text-center text-xs text-soft" />
      </div>
    </main>
  );
}
