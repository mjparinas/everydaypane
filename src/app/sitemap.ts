import type { MetadataRoute } from "next";

import { POSTS } from "@/content/posts";
import { COMPETITORS } from "@/lib/compare";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticPaths = ["/", "/pricing/", "/features/", "/compare/", "/blog/", "/privacy/", "/terms/", "/contact/"];
  return [
    ...staticPaths.map((path) => ({
      url: `${SITE_URL}${path}`,
      lastModified: now,
      changeFrequency: path === "/blog/" ? ("daily" as const) : ("weekly" as const),
      priority: path === "/" ? 1 : 0.8,
    })),
    ...COMPETITORS.map((c) => ({
      url: `${SITE_URL}/compare/${c.slug}/`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...POSTS.map((p) => ({
      url: `${SITE_URL}/blog/${p.slug}/`,
      lastModified: new Date(p.date),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
