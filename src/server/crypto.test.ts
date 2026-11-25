import { describe, expect, it } from "vitest";

import { useTestServer } from "@/test/server";

import { decrypt, encrypt, safeEqual } from "./crypto";

describe("crypto", () => {
  useTestServer();

  it("round-trips a secret and rejects tampering", () => {
    const sealed = encrypt("refresh-token");
    expect(sealed).not.toContain("refresh-token");
    expect(decrypt(sealed)).toBe("refresh-token");
    const [v, iv, tag, body] = sealed.split(".");
    const tamperedBody = Buffer.from(body ?? "", "base64url");
    tamperedBody[0] = (tamperedBody[0] ?? 0) ^ 1;
    expect(decrypt([v, iv, tag, tamperedBody.toString("base64url")].join("."))).toBeNull();
    expect(decrypt("junk")).toBeNull();
  });

  it("compares in constant time", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
