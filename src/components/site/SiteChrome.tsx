import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";

import { Mark, Wordmark } from "@/components/Wordmark";
import { BRAND } from "@/lib/brand";
import { APP_PATH, CONTACT_EMAIL, DISPLAY_PATH, FAMILY_PATH, SIGN_IN_PATH, SIGNUP_PATH, SITE_URL } from "@/lib/site";
import { SESSION_COOKIE, sessionFor } from "@/server/auth";

import { BuildStamp } from "./BuildStamp";
import { SiteBeacon } from "./SiteBeacon";

const NAV = [
  { href: "/features/", label: "Features" },
  { href: "/pricing/", label: "Pricing" },
  { href: "/compare/", label: "Compare" },
  { href: "/blog/", label: "Blog" },
] as const;

/** Friendly label + initials from an email (no separate profile name stored). */
function accountNavLabel(email: string): { name: string; initials: string } {
  const local = (email.split("@")[0] ?? email).trim();
  const parts = local.split(/[._+\-]+/).filter(Boolean);
  const name = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ") || email;
  const initials = (parts.length >= 2 ? `${parts[0]?.charAt(0) ?? ""}${parts[1]?.charAt(0) ?? ""}` : name.slice(0, 2)).toUpperCase();
  return { name, initials: initials || "?" };
}

export function JsonLd({ data }: { data: object | object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export async function SiteHeader() {
  const session = await sessionFor((await cookies()).get(SESSION_COOKIE)?.value);
  const account = session ? accountNavLabel(session.email) : null;
  const home = session?.role === "admin" ? APP_PATH : FAMILY_PATH;

  return (
    <header className="site-header sticky top-0 z-30 border-b border-line/70 bg-bg/90 backdrop-blur-lg">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5" aria-label={BRAND.name}>
          <Mark size={36} className="rounded-[10px] shadow-sm" />
          <Wordmark height={22} className="hidden min-[420px]:block" />
        </Link>
        <nav aria-label="Site" className="flex items-center gap-0.5 text-sm font-semibold">
          <ul className="hidden items-center gap-0.5 md:flex">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="rounded-lg px-3 py-2 text-soft hover:bg-panel hover:text-ink">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
          {/* Melvin, 2026-11-25: a wall screen opens the home page and taps this instead of typing /display/. */}
          <Link
            href={DISPLAY_PATH}
            data-cta="nav-connect-display"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-soft hover:bg-panel hover:text-ink"
          >
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
              <rect x="2.5" y="3.5" width="15" height="10" rx="1.5" />
              <path d="M7 16.5h6M10 13.5v3" strokeLinecap="round" />
            </svg>
            <span className="hidden min-[520px]:inline">Connect a display</span>
            <span className="min-[520px]:hidden">Display</span>
          </Link>
          {account && session ? (
            <Link
              href={home}
              title={session.email}
              className="ml-1 inline-flex max-w-[min(100%,14rem)] items-center gap-2 rounded-xl py-1 pr-2 pl-1 text-ink hover:bg-panel"
            >
              <span
                className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold tracking-wide text-white"
                aria-hidden
              >
                {account.initials}
              </span>
              <span className="min-w-0 truncate text-sm font-semibold">{account.name}</span>
            </Link>
          ) : (
            <>
              <Link
                href={SIGN_IN_PATH}
                className="hidden min-[380px]:inline-flex rounded-lg px-3 py-2 text-soft hover:bg-panel hover:text-ink"
              >
                Sign In
              </Link>
              <Link href={SIGNUP_PATH} className="btn-primary ml-1 rounded-xl px-3.5 text-sm sm:px-4" data-cta="nav-start-free">
                Start Free
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-panel/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <Link href="/" className="inline-flex items-center gap-2">
            <Mark size={32} className="rounded-lg" />
            <span className="font-display text-lg font-extrabold tracking-tight">{BRAND.name}</span>
          </Link>
          <p className="mt-3 max-w-xs text-sm text-soft">{BRAND.tagline} A wall dashboard for the family kitchen.</p>
        </div>
        <FooterCol
          title="Product"
          links={[
            { href: "/features/", label: "Features" },
            { href: "/pricing/", label: "Pricing" },
            { href: "/compare/", label: "Compare" },
            { href: APP_PATH, label: "Open Household" },
            { href: DISPLAY_PATH, label: "Connect a Display" },
            { href: FAMILY_PATH, label: "Family Board" },
          ]}
        />
        <FooterCol
          title="Learn"
          links={[
            { href: "/blog/", label: "Blog & Updates" },
            { href: "/compare/dakboard/", label: "vs DAKboard" },
            { href: "/compare/homescreens/", label: "vs Home Screens" },
            { href: "/compare/skylight/", label: "vs Skylight" },
            { href: "/compare/magicmirror/", label: "vs MagicMirror" },
            { href: "/compare/echo-show/", label: "vs Echo Show" },
          ]}
        />
        <FooterCol
          title="Company"
          links={[
            { href: "/privacy/", label: "Privacy" },
            { href: "/terms/", label: "Terms" },
            { href: "/contact/", label: "Contact" },
            { href: `mailto:${CONTACT_EMAIL}`, label: CONTACT_EMAIL },
          ]}
        />
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-soft">
          <p>
            © {new Date().getFullYear()} {BRAND.name}.
          </p>
          <BuildStamp />
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <nav aria-label={title}>
      <p className="font-semibold text-ink">{title}</p>
      <ul className="mt-3 space-y-2 text-sm text-soft">
        {links.map((l) => (
          <li key={l.href + l.label}>
            {l.href.startsWith("mailto:") ? (
              <a href={l.href} className="hover:text-ink">
                {l.label}
              </a>
            ) : (
              <Link href={l.href} className="hover:text-ink">
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SitePage({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="site min-h-dvh">
      <SiteBeacon />
      <SiteHeader />
      <main className={`mx-auto px-4 py-10 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>{children}</main>
      <SiteFooter />
    </div>
  );
}

export function CtaBanner({ title, body, cta }: { title: string; body: string; cta: string }) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand via-[#4c6ef5] to-amber-400 px-6 py-10 text-white shadow-lg sm:px-10">
      <div aria-hidden className="pointer-events-none absolute -right-10 -bottom-16 size-56 rounded-full bg-white/15 blur-2xl" />
      <h2 className="font-display relative text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h2>
      <p className="relative mt-2 max-w-xl text-white/90">{body}</p>
      <Link
        href={SIGNUP_PATH}
        data-cta={cta}
        data-track="start_free"
        className="relative mt-6 inline-flex min-h-12 items-center rounded-2xl bg-white px-6 font-semibold text-brand shadow-md"
      >
        Start Free
      </Link>
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-display text-xs font-bold tracking-[0.2em] text-brand uppercase">{children}</p>;
}

export function Check() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden className="mt-0.5 shrink-0 text-good">
      <path fill="currentColor" d="M8.2 14.6 3.9 10.3l1.4-1.4 2.9 2.9 6.5-6.5 1.4 1.4z" />
    </svg>
  );
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND.name,
    url: SITE_URL,
    logo: `${SITE_URL}/icons/icon-512.png`,
    email: CONTACT_EMAIL,
    description: BRAND.lede,
  };
}
