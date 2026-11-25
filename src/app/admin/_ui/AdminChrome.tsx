"use client";

import type { ReactNode } from "react";

import { BuildStamp } from "@/components/site/BuildStamp";
import { Mark } from "@/components/Wordmark";
import { ADMIN_TAB_GROUPS, type AdminTab } from "@/lib/adminTabs";

export function AdminBrand({ as: Tag = "h1" }: { as?: "h1" | "div" }) {
  return (
    <Tag className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-ink">
      <Mark size={32} />
      <span>
        Everydaypane{" "}
        <span className="ml-0.5 rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 align-middle text-xs font-bold uppercase tracking-[0.12em] text-brand">
          admin
        </span>
      </span>
    </Tag>
  );
}

function NavItem({ tab, on, badge, onClick }: { tab: string; on: boolean; badge?: number; onClick: () => void }) {
  return (
    <li className="lg:w-full">
      <button
        type="button"
        aria-current={on ? "page" : undefined}
        onClick={onClick}
        className={`flex min-h-9 items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors lg:min-h-0 lg:w-full lg:py-[0.4rem] lg:text-left ${
          on ? "bg-brand/10 text-ink" : "text-soft hover:bg-bg hover:text-ink"
        }`}
      >
        <span className="lg:flex-1">{tab}</span>
        {badge ? (
          <span className="rounded-full bg-brand px-1.5 text-xs font-bold text-brand-ink tabular-nums" aria-label={`${badge} waiting`}>
            {badge}
          </span>
        ) : null}
      </button>
    </li>
  );
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
  return (
    <div className="min-h-dvh bg-bg">
      <aside className="flex flex-wrap items-center gap-x-3 gap-y-3 border-b border-line px-4 pt-4 pb-3 lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-60 lg:flex-col lg:flex-nowrap lg:items-stretch lg:gap-4 lg:overflow-hidden lg:border-r lg:border-b-0 lg:bg-panel/95 lg:px-3 lg:py-5">
        <div className="order-1 lg:shrink-0 lg:px-2">
          <AdminBrand />
        </div>
        <nav className="order-3 flex w-full flex-wrap gap-1 lg:order-2 lg:min-h-0 lg:flex-1 lg:block lg:overflow-y-auto" aria-label="Sections">
          {ADMIN_TAB_GROUPS.map((g) => (
            <div key={g.label} className="contents lg:mb-3 lg:block">
              <div className="hidden px-3 pb-1.5 text-[0.65rem] font-bold tracking-[0.14em] text-soft uppercase lg:block" aria-hidden>
                {g.label}
              </div>
              <ul className="contents lg:flex lg:flex-col lg:gap-0.5">
                {g.tabs.map((t) => (
                  <NavItem key={t} tab={t} on={tab === t} badge={badges[t]} onClick={() => onTab?.(t)} />
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="order-2 ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-soft lg:order-3 lg:ml-0 lg:shrink-0 lg:flex-col lg:items-stretch lg:gap-2 lg:border-t lg:border-line lg:bg-panel lg:px-2 lg:pt-4">
          {staff && (
            <span className="min-w-0 break-all">
              {staff.email} <span className="rounded-full bg-bg px-1.5 py-0.5 text-[0.7rem] font-semibold capitalize">{staff.role}</span>
            </span>
          )}
          <a className="underline hover:text-ink" href="/household/">
            My household
          </a>
          {onSignOut && (
            <button type="button" className="text-left underline hover:text-ink" onClick={onSignOut}>
              Sign out
            </button>
          )}
          <BuildStamp className="hidden lg:block" />
        </div>
      </aside>
      <div className="lg:pl-60">
        <div className="mx-auto max-w-6xl px-4 pb-16">
          <header className="z-20 -mx-4 border-b border-line bg-bg/90 px-4 pt-3 pb-3 backdrop-blur-xl md:sticky md:top-0 lg:pt-5">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="mr-auto text-xl font-extrabold tracking-tight">{tab}</h2>
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
