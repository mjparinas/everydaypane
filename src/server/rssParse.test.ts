import { describe, expect, it } from "vitest";

import { parseRss } from "./rssParse";

describe("parseRss", () => {
  it("reads titles and links from a minimal RSS feed", () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item><title>Hello</title><link>https://example.com/a</link></item>
      <item><title><![CDATA[Hi]]></title><link>https://example.com/b</link></item>
    </channel></rss>`;
    expect(parseRss(xml)).toEqual([
      { title: "Hello", link: "https://example.com/a" },
      { title: "Hi", link: "https://example.com/b" },
    ]);
  });
});
