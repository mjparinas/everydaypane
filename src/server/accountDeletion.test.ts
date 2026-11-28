import { describe, expect, it, vi } from "vitest";

import { DELETE, GET } from "@/app/api/account/route";
import { cookieFor, req, useTestServer } from "@/test/server";

import { deleteAccount, deletionPlan } from "./accountDeletion";
import { accountById, accountsForEmail, createAccount, LEGACY_ACCOUNT_ID, setStripeIds, upsertMember } from "./accounts";
import { query } from "./db";
import { listMobileDevices, registerMobileDevice } from "./mobile";
import { addShoppingItem, listShopping } from "./shopping";

const confirm = (cookie: string, body: unknown = { confirm: "DELETE" }) =>
  DELETE(req("/api/account/", { method: "DELETE", headers: { cookie }, body: JSON.stringify(body) }));

describe("Delete Account", () => {
  useTestServer();

  it("deletes a household its only admin deletes, with every row that names it", async () => {
    const home = await createAccount("Parks Home", "pat@example.com");
    await upsertMember(home.id, "sam@example.com", "family");
    await addShoppingItem(home.id, { text: "Milk", by: "pat@example.com" });
    await registerMobileDevice(
      { accountId: home.id, email: "pat@example.com" },
      { platform: "ios", name: "iPhone", pushToken: null, pushEnv: "production" },
      null,
    );
    const other = await createAccount("Next Door", "lee@example.com");
    await addShoppingItem(other.id, { text: "Eggs", by: "lee@example.com" });

    const cookie = await cookieFor("pat@example.com");
    const plan = (await (await GET(req("/api/account/", { headers: { cookie } }))).json()) as {
      plan: Awaited<ReturnType<typeof deletionPlan>>;
    };
    expect(plan.plan.deleteHouseholds.map((h) => h.name)).toEqual(["Parks Home"]);
    expect(plan.plan.blocked).toBeNull();

    expect((await confirm(cookie, { confirm: "yes" })).status).toBe(400);
    expect((await confirm(cookie)).status).toBe(200);

    expect(await accountById(home.id)).toBeNull();
    expect((await listShopping(home.id)).items).toEqual([]);
    expect(await listMobileDevices(home.id)).toEqual([]);
    expect(await query("SELECT * FROM account_members WHERE account_id = ?", [home.id])).toEqual([]);
    expect(await query("SELECT * FROM account_config WHERE account_id = ?", [home.id])).toEqual([]);
    expect(await query("SELECT * FROM signup_emails WHERE email = ?", ["pat@example.com"])).toEqual([]);
    // The neighbours are untouched.
    expect((await listShopping(other.id)).items.map((i) => i.text)).toEqual(["Eggs"]);
    expect(await accountsForEmail("sam@example.com")).toEqual([]);
  });

  it("only leaves a household that has another admin, or where the person is family", async () => {
    const home = await createAccount("Parks Home", "pat@example.com");
    await upsertMember(home.id, "alex@example.com", "admin");
    await upsertMember(home.id, "sam@example.com", "family");

    const result = await deleteAccount("sam@example.com");
    expect(result.ok && result.plan.leaveHouseholds.map((h) => h.name)).toEqual(["Parks Home"]);
    expect(await accountById(home.id)).not.toBeNull();
    expect(await accountsForEmail("sam@example.com")).toEqual([]);

    const admin = await deleteAccount("pat@example.com");
    expect(admin.ok && admin.plan.deleteHouseholds).toEqual([]);
    expect((await accountsForEmail("alex@example.com")).map((m) => m.role)).toEqual(["admin"]);
  });

  it("stops before deleting anything when the plan can't be cancelled", async () => {
    const home = await createAccount("Parks Home", "pat@example.com");
    await setStripeIds(home.id, { customerId: "cus_1", subscriptionId: "sub_1" });
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    const { setStripeForTests } = await import("./billing");
    setStripeForTests({
      subscriptions: {
        cancel: () => Promise.reject(Object.assign(new Error("down"), { code: "api_error" })),
      },
    } as never);
    try {
      expect(await deleteAccount("pat@example.com")).toEqual({ ok: false, error: "billing" });
      expect(await accountById(home.id)).not.toBeNull();
    } finally {
      setStripeForTests(null);
    }
  });

  it("never deletes the grandfather household or the people the env lists", async () => {
    const cookie = await cookieFor("admin@example.com");
    expect((await confirm(cookie)).status).toBe(409);
    expect(await accountById(LEGACY_ACCOUNT_ID)).not.toBeNull();
    expect((await deletionPlan("kid@example.com")).blocked).toBe("staff");
  });
});
