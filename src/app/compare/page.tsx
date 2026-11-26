import type { Metadata } from "next";
import Link from "next/link";

import { CtaBanner, Eyebrow, SitePage } from "@/components/site/SiteChrome";
import { COMPETITORS } from "@/lib/compare";
import { pageMeta } from "@/lib/pageMeta";

export const metadata: Metadata = pageMeta({
  title: "Compare Everydaypane",
  description:
    "Everydaypane vs DAKboard, MagicMirror, Skylight, Echo Show, Hearth and Cozyla — fair feature comparisons for family wall dashboards.",
  path: "/compare/",
});

export default function CompareIndex() {
  return (
    <SitePage wide>
      <Eyebrow>Compare</Eyebrow>
      <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">How Everydaypane Stacks Up</h1>
      <p className="mt-4 max-w-2xl text-lg text-soft">
        Facts checked against vendor pages on 2026-11-23. We say when the other product is the better pick.
      </p>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {COMPETITORS.map((c) => (
          <li key={c.slug}>
            <Link href={`/compare/${c.slug}/`} className="card block h-full hover:border-brand/50">
              <h2 className="text-lg font-bold">vs {c.name}</h2>
              <p className="mt-2 text-sm text-soft">{c.summary}</p>
              <p className="mt-3 text-sm font-semibold text-brand">Read the comparison →</p>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-14">
        <CtaBanner cta="compare-index" title="Prefer Trying Over Reading?" body="Start free and drag your first widgets onto the wall." />
      </div>
    </SitePage>
  );
}
