import type { Metadata } from "next";

import { BRAND } from "./brand";
import { SITE_URL } from "./site";

const OG = { url: `${SITE_URL}/og/default.jpg`, width: 1200, height: 630, alt: BRAND.name };

export interface PageMetaInput {
  title: string;
  description: string;
  /** Path with trailing slash, e.g. "/pricing/". */
  path: string;
  absoluteTitle?: boolean;
  shareTitle?: string;
  type?: "website" | "article";
  published?: string;
  modified?: string;
  noindex?: boolean;
}

const TITLE_MAX = 65;
const withBrand = (title: string) => !title.includes(BRAND.name) && `${title} · ${BRAND.name}`.length <= TITLE_MAX;

export function pageMeta(o: PageMetaInput): Metadata {
  const shareTitle = o.shareTitle ?? o.title;
  const url = `${SITE_URL}${o.path}`;
  const image = { ...OG, alt: shareTitle };
  return {
    title: o.absoluteTitle || !withBrand(o.title) ? { absolute: o.title } : o.title,
    description: o.description,
    ...(o.noindex ? { robots: { index: false, follow: true } } : { robots: { index: true, follow: true } }),
    alternates: { canonical: url },
    openGraph: {
      type: o.type ?? "website",
      siteName: BRAND.name,
      title: shareTitle,
      description: o.description,
      url,
      locale: "en_CA",
      images: [image],
      ...(o.type === "article" && o.published ? { publishedTime: o.published, modifiedTime: o.modified ?? o.published } : {}),
    },
    twitter: { card: "summary_large_image", title: shareTitle, description: o.description, images: [image.url] },
  };
}
