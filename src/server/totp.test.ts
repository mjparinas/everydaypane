import { afterEach, describe, expect, it } from "vitest";

import { codeAtStep, hashBackupCode, looksLikeBackupCode, newBackupCodes, newSecret, stepAt, verifyTotp } from "./totp";

describe("totp", () => {
  afterEach(() => {
    // no env mutation
  });

  it("verifies a current step code and refuses reuse", () => {
    const secret = newSecret();
    const now = Date.now();
    const step = stepAt(now);
    const code = codeAtStep(secret, step);
    expect(verifyTotp(secret, code, null, now)).toBe(step);
    expect(verifyTotp(secret, code, step, now)).toBeNull();
  });

  it("makes backup codes that look valid", () => {
    const codes = newBackupCodes();
    expect(codes).toHaveLength(8);
    for (const c of codes) {
      expect(looksLikeBackupCode(c)).toBe(true);
      expect(hashBackupCode(c)).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
