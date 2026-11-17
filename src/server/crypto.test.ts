import { describe, expect, it } from "vitest";

import { useTestServer } from "@/test/server";

import { decrypt, encrypt, safeEqual } from "./crypto";

describe("crypto", () => {
  useTestServer();

  it("round-trips a secret and rejects tampering", () => {
    const sealed = encrypt("refresh-token");
    expect(sealed).not.toContain("refresh-token");
    expect(decrypt(sealed)).toBe("refresh-token");
    expect(decrypt(sealed.slice(0, -2) + "AA")).toBeNull();
    expect(decrypt("junk")).toBeNull();
  });

  it("compares in constant time", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
