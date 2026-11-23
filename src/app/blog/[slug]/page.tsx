import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArticleBody } from "@/components/site/ArticleBody";
import { CtaBanner, Eyebrow, JsonLd, SitePage } from "@/components/site/SiteChrome";
import { postBySlug, POSTS, readMinutes } from "@/content/posts";
import { pageMeta } from "@/lib/pageMeta";
import { SITE_URL } from "@/lib/site";

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = postBySlug(slug);
  if (!post) return {};
  return pageMeta({
    title: post.title,
    description: post.description,
    path: `/blog/${post.slug}/`,
    type: "article",
    published: post.date,
    image: post.image,
  });
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = postBySlug(slug);
  if (!post) notFound();
  const related = POSTS.filter((p) => p.slug !== post.slug && p.kind === post.kind).slice(0, 3);
  const imageUrl = `${SITE_URL}${post.image}`;

  return (
    <SitePage>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          description: post.description,
          datePublished: post.date,
          dateModified: post.date,
          image: imageUrl,
          author: { "@type": "Organization", name: "Everydaypane" },
          mainEntityOfPage: `${SITE_URL}/blog/${post.slug}/`,
        }}
      />
      <p className="text-sm text-soft">
        <Link href="/blog/" className="hover:text-ink">
          Blog
        </Link>{" "}
        / {post.tag}
      </p>
      <Eyebrow>{post.tag}</Eyebrow>
      <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">{post.title}</h1>
      <p className="mt-4 text-sm text-soft">
        {post.date}
        {post.version ? ` · v${post.version}` : ""} · {readMinutes(post)} min read
      </p>
      <p className="mt-6 text-lg text-soft">{post.description}</p>
      <figure className="mt-8 overflow-hidden rounded-2xl border border-line bg-panel">
        {/* eslint-disable-next-line @next/next/no-img-element -- static PNG previews in /public/templates */}
        <img src={post.image} alt={`Everydaypane screenshot for ${post.title}`} className="h-auto w-full" width={1920} height={1080} />
      </figure>
      <div className="mt-10">
        <ArticleBody blocks={post.body} />
      </div>
      {related.length ? (
        <aside className="mt-14 border-t border-line pt-10">
          <h2 className="font-display text-xl font-extrabold">Related</h2>
          <ul className="mt-4 space-y-3">
            {related.map((p) => (
              <li key={p.slug}>
                <Link href={`/blog/${p.slug}/`} className="font-semibold text-brand hover:underline">
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
      <div className="mt-14">
        <CtaBanner
          cta={`blog-${post.slug}`}
          title="See it on your wall"
          body="Start free in minutes. Household is the best value when you want every widget."
        />
      </div>
    </SitePage>
  );
}
