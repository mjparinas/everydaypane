import { POSTS } from "@/content/posts";
import { BRAND } from "@/lib/brand";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
  const items = POSTS.map(
    (p) => `
    <item>
      <title><![CDATA[${p.title}]]></title>
      <link>${SITE_URL}/blog/${p.slug}/</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${p.slug}/</guid>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
      <description><![CDATA[${p.description}]]></description>
    </item>`,
  ).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${BRAND.name} blog</title>
    <link>${SITE_URL}/blog/</link>
    <description>Updates, guides and comparisons from ${BRAND.name}.</description>
    <language>en-ca</language>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
