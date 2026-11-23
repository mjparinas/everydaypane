import "server-only";

// Minimal RSS/Atom title + link extraction — no XML dependency in CI.

export interface RssItem {
  title: string;
  link: string;
}

const itemBlock = /<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi;
const tag = (block: string, name: string) => {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i").exec(block);
  if (!m) return "";
  return decodeXml(m[1]!.replace(/<!\[CDATA\[([\s\S]*?)]]>/g, "$1").trim());
};
const linkHref = (block: string) => {
  const m = /<link[^>]+href=["']([^"']+)["']/i.exec(block);
  if (m) return m[1]!;
  return tag(block, "link");
};

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function parseRss(xml: string, max = 20): RssItem[] {
  const blocks = xml.match(itemBlock) ?? [];
  const out: RssItem[] = [];
  for (const block of blocks) {
    const title = tag(block, "title").slice(0, 200);
    const link = linkHref(block).slice(0, 500);
    if (!title || !link.startsWith("http")) continue;
    out.push({ title, link });
    if (out.length >= max) break;
  }
  return out;
}
