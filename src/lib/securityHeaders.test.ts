import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, CSP } from "./securityHeaders";

describe("contentSecurityPolicy", () => {
  it("never allows unsafe-inline scripts", () => {
    expect(CSP).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(contentSecurityPolicy({ nonce: "abc", script: "nonce" })).toContain("'nonce-abc'");
    expect(contentSecurityPolicy({ nonce: "abc", script: "nonce" })).toContain("'strict-dynamic'");
    expect(contentSecurityPolicy({ nonce: "abc", script: "nonce" })).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });
});
