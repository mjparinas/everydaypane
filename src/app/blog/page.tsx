import type { Metadata } from "next";
import Link from "next/link";

import { CtaBanner, Eyebrow, JsonLd, SitePage } from "@/components/site/SiteChrome";
import { POSTS, readMinutes } from "@/content/posts";
import { BRAND } from "@/lib/brand";
import { pageMeta } from "@/lib/pageMeta";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = pageMeta({
  title: "Blog & updates",
  description: "Everydaypane release notes, setup guides and comparisons — so families can discover the wall dashboard.",
  path: "/blog/",
});

export default function BlogIndex() {
  const [first, ...rest] = POSTS;
  return (
    <SitePage wide>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Blog",
          name: `${BRAND.name} blog`,
          url: `${SITE_URL}/blog/`,
          blogPost: POSTS.map((p) => ({
            "@type": "BlogPosting",
            headline: p.title,
            url: `${SITE_URL}/blog/${p.slug}/`,
            datePublished: p.date,
          })),
        }}
      />
      <Eyebrow>Blog</Eyebrow>
      <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Updates, guides and comparisons</h1>
      <p className="mt-4 max-w-2xl text-lg text-soft">
        Every release, plus deep articles that help families find Everydaypane.{" "}
        <a href="/blog/feed.xml" className="font-semibold text-brand hover:underline">
          RSS feed
        </a>
        .
      </p>
      <ul className="mt-10 grid gap-4 md:grid-cols-2">
        {first ? (
          <li className="md:col-span-2">
            <Link href={`/blog/${first.slug}/`} className="card block hover:border-brand/50">
              <span className="text-xs font-bold tracking-wide text-brand uppercase">{first.tag}</span>
              <span className="mt-1 block font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{first.title}</span>
              <span className="mt-2 block text-soft">{first.description}</span>
              <span className="mt-3 block text-xs text-soft">
                {first.date} · {readMinutes(first)} min read
              </span>
            </Link>
          </li>
        ) : null}
        {rest.map((p) => (
          <li key={p.slug}>
            <Link href={`/blog/${p.slug}/`} className="card block h-full hover:border-brand/50">
              <span className="text-xs font-bold tracking-wide text-brand uppercase">{p.tag}</span>
              <span className="mt-1 block font-bold tracking-tight">{p.title}</span>
              <span className="mt-2 block text-sm text-soft">{p.description}</span>
              <span className="mt-3 block text-xs text-soft">
                {p.date} · {readMinutes(p)} min
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-14">
        <CtaBanner cta="blog-index" title="Put a pane on your wall" body="Start free — Family unlocks every widget when you're ready." />
      </div>
    </SitePage>
  );
}
