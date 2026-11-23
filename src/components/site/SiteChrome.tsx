import Link from "next/link";
import type { ReactNode } from "react";

import { Mark, Wordmark } from "@/components/Wordmark";
import { BRAND } from "@/lib/brand";
import { APP_PATH, CONTACT_EMAIL, FAMILY_PATH, SITE_URL } from "@/lib/site";

import { BuildStamp } from "./BuildStamp";

const NAV = [
  { href: "/features/", label: "Features" },
  { href: "/pricing/", label: "Pricing" },
  { href: "/compare/", label: "Compare" },
  { href: "/blog/", label: "Blog" },
] as const;

export function JsonLd({ data }: { data: object | object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export function SiteHeader() {
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
          <Link href="/signin/" className="hidden min-[380px]:inline-flex rounded-lg px-3 py-2 text-soft hover:bg-panel hover:text-ink">
            Sign in
          </Link>
          <Link href={APP_PATH} className="btn-primary ml-1 rounded-xl px-3.5 text-sm sm:px-4">
            Start free
          </Link>
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
            { href: APP_PATH, label: "Open household" },
            { href: FAMILY_PATH, label: "Family board" },
          ]}
        />
        <FooterCol
          title="Learn"
          links={[
            { href: "/blog/", label: "Blog & updates" },
            { href: "/compare/dakboard/", label: "vs DAKboard" },
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
        href={APP_PATH}
        data-cta={cta}
        className="relative mt-6 inline-flex min-h-12 items-center rounded-2xl bg-white px-6 font-semibold text-brand shadow-md"
      >
        Start free
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
