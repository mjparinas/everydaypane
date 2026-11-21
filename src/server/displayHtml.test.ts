import { describe, expect, it } from "vitest";

import { displayHtml } from "./displayHtml";

describe("display page", () => {
  it("can't be pinch-zoomed (Melvin, 2026-11-17)", async () => {
    const html = await displayHtml({ token: "abc", title: "Kitchen" }).text();
    expect(html).toMatch(/<meta name="viewport" content="[^"]*maximum-scale=1,user-scalable=no/);
  });

  it("lets video come only from the go2rtc server at home, and says which one", async () => {
    const plain = displayHtml({ token: "abc", title: "Kitchen" });
    expect(plain.headers.get("Content-Security-Policy")).toContain("media-src 'self';");
    const live = displayHtml({ token: "abc", title: "Kitchen", mediaOrigin: "https://cams.example.com:8443" });
    const policy = live.headers.get("Content-Security-Policy") ?? "";
    expect(policy).toContain("media-src 'self' https://cams.example.com:8443;");
    expect(policy).toContain("img-src 'self' data: blob: https://cams.example.com:8443;");
    expect(policy).toContain("connect-src 'self' https://*.ingest.sentry.io");
    expect(await live.text()).toContain('data-media="https://cams.example.com:8443"');
  });
});
