import { describe, expect, it } from "vitest";

import { isFreeSafeConfig } from "@/lib/config/defaults";
import { useTestServer } from "@/test/server";

import { accountById, accountsForEmail, createAccount, ensureAccountsSeeded, LEGACY_ACCOUNT_ID } from "./accounts";
import { loadConfig } from "./config";
import { gateConfig } from "./planGates";

describe("accounts", () => {
  useTestServer();

  it("seeds a Paid grandfather household from ADMIN_EMAILS", async () => {
    await ensureAccountsSeeded();
    const legacy = await accountById(LEGACY_ACCOUNT_ID);
    expect(legacy?.plan).toBe("paid");
    const members = await accountsForEmail("admin@example.com");
    expect(members[0]?.accountId).toBe(LEGACY_ACCOUNT_ID);
    expect(members[0]?.role).toBe("admin");
  });

  it("creates a Free household with a Free-safe starter layout", async () => {
    await ensureAccountsSeeded();
    const account = await createAccount("Pat's home", "pat@example.com");
    expect(account.plan).toBe("free");
    expect(account.id).not.toBe(LEGACY_ACCOUNT_ID);
    const members = await accountsForEmail("pat@example.com");
    expect(members).toEqual([expect.objectContaining({ accountId: account.id, role: "admin" })]);
    const { config, version } = await loadConfig(account.id);
    expect(version).toBe(0);
    expect(isFreeSafeConfig(config)).toBe(true);
    expect(gateConfig("free", config)).toEqual({ ok: true });
    expect(config.views).toHaveLength(1);
  });
});
