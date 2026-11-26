import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CtaBanner, Eyebrow, JsonLd, SitePage } from "@/components/site/SiteChrome";
import { BRAND } from "@/lib/brand";
import { competitor, COMPETITORS, OURS, TOPIC_LABEL, type Topic } from "@/lib/compare";
import { pageMeta } from "@/lib/pageMeta";

export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = competitor(slug);
  if (!c) return {};
  return pageMeta({
    title: `${BRAND.name} vs ${c.name}`,
    description: c.summary,
    path: `/compare/${c.slug}/`,
  });
}

export default async function CompareSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = competitor(slug);
  if (!c) notFound();
  const topics = Object.keys(c.rows) as Topic[];

  return (
    <SitePage wide>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: `${BRAND.name} vs ${c.name}`,
          description: c.summary,
          dateModified: "2026-11-23",
        }}
      />
      <p className="text-sm text-soft">
        <Link href="/compare/" className="hover:text-ink">
          Compare
        </Link>{" "}
        / {c.name}
      </p>
      <Eyebrow>Comparison</Eyebrow>
      <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
        {BRAND.name} vs {c.name}
      </h1>
      <p className="mt-4 max-w-3xl text-lg text-soft">{c.summary}</p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <article className="card border-brand/40 bg-brand/5">
          <h2 className="font-bold text-brand">Why Families Pick {BRAND.name}</h2>
          <p className="mt-2 text-sm text-soft">{c.ourEdge}</p>
        </article>
        <article className="card">
          <h2 className="font-bold">When {c.name} is the better pick</h2>
          <p className="mt-2 text-sm text-soft">{c.theirPick}</p>
        </article>
      </div>

      <div className="mt-12 overflow-x-auto rounded-2xl border border-line bg-panel">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">
            {BRAND.name} compared with {c.name}
          </caption>
          <thead className="border-b border-line bg-bg/80 text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Topic</th>
              <th className="px-4 py-3">{BRAND.name}</th>
              <th className="px-4 py-3">{c.name}</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((topic) => (
              <tr key={topic} className="border-b border-line/70 align-top last:border-0">
                <th className="px-4 py-4 font-semibold">{TOPIC_LABEL[topic]}</th>
                <td className="px-4 py-4 text-soft">{OURS[topic]}</td>
                <td className="px-4 py-4 text-soft">
                  <ul className="space-y-2">
                    {(c.rows[topic] ?? []).map((f) => (
                      <li key={f.text}>
                        {f.text} <span className="block text-xs text-soft/80">Checked {f.checked}</span>
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-sm text-soft">
        Also see{" "}
        {COMPETITORS.filter((x) => x.slug !== c.slug)
          .slice(0, 3)
          .map((x, i) => (
            <span key={x.slug}>
              {i ? ", " : ""}
              <Link href={`/compare/${x.slug}/`} className="font-semibold text-brand hover:underline">
                vs {x.name}
              </Link>
            </span>
          ))}
        , or the{" "}
        <Link href="/blog/best-family-dashboard-2026/" className="font-semibold text-brand hover:underline">
          2026 Roundup
        </Link>
        .
      </p>

      <div className="mt-14">
        <CtaBanner
          cta={`compare-${c.slug}`}
          title={`Try ${BRAND.name} free`}
          body="Bring your own screen. Upgrade to Household when you want every widget."
        />
      </div>
    </SitePage>
  );
}
