import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAccount, LEGACY_ACCOUNT_ID, resetAccountsForTests, upsertMember } from "./accounts";
import { resetForTests } from "./db";
import { isStaffEmail, staffEnabled } from "./staff";
import { listHouseholdsForStaff } from "./staffAccounts";

describe("staff", () => {
  const prev = process.env.ADMIN_EMAILS;

  beforeEach(async () => {
    resetForTests();
    resetAccountsForTests();
    process.env.ADMIN_EMAILS = "ops@example.com";
  });

  afterEach(() => {
    process.env.ADMIN_EMAILS = prev;
    resetForTests();
    resetAccountsForTests();
  });

  it("treats ADMIN_EMAILS as platform staff", () => {
    expect(staffEnabled()).toBe(true);
    expect(isStaffEmail("ops@example.com")).toBe(true);
    expect(isStaffEmail("OPS@example.com")).toBe(true);
    expect(isStaffEmail("customer@example.com")).toBe(false);
  });

  it("lists households with members and device counts", async () => {
    await upsertMember(LEGACY_ACCOUNT_ID, "ops@example.com", "admin");
    const other = await createAccount("River's home", "river@example.com");
    await upsertMember(other.id, "kid@example.com", "family");

    const list = await listHouseholdsForStaff();
    expect(list.length).toBeGreaterThanOrEqual(2);
    const river = list.find((h) => h.id === other.id);
    expect(river?.name).toBe("River's home");
    expect(river?.plan).toBe("free");
    expect(river?.members.map((m) => m.email).sort()).toEqual(["kid@example.com", "river@example.com"]);
    expect(river?.deviceCount).toBe(0);
  });
});
