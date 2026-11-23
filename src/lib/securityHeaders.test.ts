import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, CSP, CSP_PREVIEW, SECURITY_HEADERS, SECURITY_HEADERS_PREVIEW } from "./securityHeaders";

describe("contentSecurityPolicy", () => {
  it("never allows unsafe-inline scripts", () => {
    expect(CSP).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(contentSecurityPolicy({ nonce: "abc", script: "nonce" })).toContain("'nonce-abc'");
    expect(contentSecurityPolicy({ nonce: "abc", script: "nonce" })).toContain("'strict-dynamic'");
    expect(contentSecurityPolicy({ nonce: "abc", script: "nonce" })).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("lets the admin embed a preview, and keeps wall pages unframeable", () => {
    expect(CSP).toContain("frame-ancestors 'none'");
    expect(CSP_PREVIEW).toContain("frame-ancestors 'self'");
    expect(CSP).toContain("frame-src 'self'");
    expect(CSP).toContain("https://earth.nullschool.net");
    expect(CSP).toContain("https://s.tradingview.com");
    expect(CSP).toContain("https://www.youtube.com");
    expect(SECURITY_HEADERS.find((h) => h.key === "X-Frame-Options")?.value).toBe("DENY");
    expect(SECURITY_HEADERS_PREVIEW.find((h) => h.key === "X-Frame-Options")?.value).toBe("SAMEORIGIN");
  });

  it("skips upgrade-insecure-requests on plain HTTP (e2e / local next start)", () => {
    expect(contentSecurityPolicy({ script: "self", upgradeInsecureRequests: true })).toContain("upgrade-insecure-requests");
    expect(contentSecurityPolicy({ script: "self", upgradeInsecureRequests: false })).not.toContain("upgrade-insecure-requests");
  });
});
