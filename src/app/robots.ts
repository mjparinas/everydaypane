import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/blog/", "/pricing/", "/features/", "/compare/", "/privacy/", "/terms/", "/contact/"],
        disallow: ["/household/", "/admin/", "/family/", "/signin/", "/api/", "/d/", "/display/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
