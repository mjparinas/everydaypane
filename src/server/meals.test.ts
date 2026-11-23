import { describe, expect, it, vi } from "vitest";

import { GET as displayGET } from "@/app/api/display/meals/route";
import { GET, PUT } from "@/app/api/meals/route";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { cookieFor, req, useTestServer } from "@/test/server";

import { query } from "./db";
import { addDevice } from "./devices";
import { mealsBetween, recentMeals, setMeal } from "./meals";

const put = (cookie: string, body: unknown) => PUT(req("/api/meals/", { method: "PUT", body: JSON.stringify(body), headers: { cookie } }));

describe("meal plan", () => {
  useTestServer();

  it("lets family plan breakfast, lunch and dinner, and clear a meal", async () => {
    const kid = await cookieFor("kid@example.com");
    expect((await put(kid, { date: "2026-11-17", slot: "dinner", text: "  Tacos " })).status).toBe(200);
    expect((await put(kid, { date: "2026-11-17", slot: "breakfast", text: "Oatmeal" })).status).toBe(200);
    expect((await put(kid, { date: "2026-11-18", slot: "lunch", text: "Soup" })).status).toBe(200);
    expect((await put(kid, { date: "2026-11-17", slot: "dinner", text: "Spaghetti" })).status).toBe(200);
    const r = await GET(req("/api/meals/?from=2026-11-17&days=7", { headers: { cookie: kid } }));
    const body = (await r.json()) as { from: string; meals: unknown; recent: string[]; origins: unknown; rules: unknown[] };
    expect(body.from).toBe("2026-11-17");
    expect(body.meals).toEqual({ "2026-11-17": { breakfast: "Oatmeal", dinner: "Spaghetti" }, "2026-11-18": { lunch: "Soup" } });
    expect(body.recent).toEqual(expect.arrayContaining(["Spaghetti", "Soup", "Oatmeal"]));
    expect(body.recent).not.toContain("Tacos");
    expect(body.rules).toEqual([]);
    expect((await put(kid, { date: "2026-11-18", slot: "lunch", text: "" })).status).toBe(200);
    expect(await mealsBetween(LEGACY_ACCOUNT_ID, "2026-11-18", 1)).toEqual({});
  });

  it("repeats a meal on a cadence, lets a day override or skip, and can stop the series", async () => {
    const kid = await cookieFor("kid@example.com");
    // Monday cereal every week.
    const created = await put(kid, {
      date: "2026-11-23",
      slot: "breakfast",
      text: "Cereal",
      repeat: { kind: "weekdays", days: [1] },
    });
    expect(created.status).toBe(200);
    const rule = ((await created.json()) as { rule: { id: string } }).rule;

    const week = await GET(req("/api/meals/?from=2026-11-23&days=8", { headers: { cookie: kid } }));
    const body = (await week.json()) as {
      meals: Record<string, Record<string, string>>;
      origins: Record<string, Record<string, { source: string; ruleId?: string }>>;
    };
    expect(body.meals["2026-11-23"]?.breakfast).toBe("Cereal");
    expect(body.meals["2026-11-30"]?.breakfast).toBe("Cereal");
    expect(body.meals["2026-11-24"]?.breakfast).toBeUndefined();
    expect(body.origins["2026-11-23"]?.breakfast).toEqual({ source: "rule", ruleId: rule.id });

    // One Tuesday eggs rule + a one-off override on a cereal Monday.
    expect((await put(kid, { date: "2026-11-24", slot: "breakfast", text: "Eggs", repeat: { kind: "weekdays", days: [2] } })).status).toBe(
      200,
    );
    expect((await put(kid, { date: "2026-11-23", slot: "breakfast", text: "Pancakes" })).status).toBe(200);
    expect((await put(kid, { date: "2026-11-30", slot: "breakfast", text: "" })).status).toBe(200);

    const after = await GET(req("/api/meals/?from=2026-11-23&days=10", { headers: { cookie: kid } }));
    const plan = (await after.json()) as { meals: Record<string, Record<string, string>> };
    expect(plan.meals["2026-11-23"]?.breakfast).toBe("Pancakes");
    expect(plan.meals["2026-11-24"]?.breakfast).toBe("Eggs");
    expect(plan.meals["2026-11-30"]?.breakfast).toBeUndefined();
    expect(plan.meals["2026-12-01"]?.breakfast).toBe("Eggs");

    // Every-other-day dinner, then stop the cereal series.
    expect((await put(kid, { date: "2026-11-23", slot: "dinner", text: "Pasta", repeat: { kind: "interval", every: 2 } })).status).toBe(
      200,
    );
    expect((await mealsBetween(LEGACY_ACCOUNT_ID, "2026-11-23", 5))["2026-11-25"]?.dinner).toBe("Pasta");
    expect((await put(kid, { stopRuleId: rule.id })).status).toBe(200);
    const stopped = await mealsBetween(LEGACY_ACCOUNT_ID, "2026-11-23", 8);
    expect(stopped["2026-11-23"]?.breakfast).toBe("Pancakes");
    expect(stopped["2026-12-07"]?.breakfast).toBeUndefined();
    expect(await recentMeals(LEGACY_ACCOUNT_ID)).toEqual(expect.arrayContaining(["Pasta", "Eggs", "Pancakes"]));
  });

  it("refuses people who aren't signed in, unknown meals and bad dates", async () => {
    expect(
      (await PUT(req("/api/meals/", { method: "PUT", body: JSON.stringify({ date: "2026-11-17", slot: "dinner", text: "x" }) }))).status,
    ).toBe(401);
    expect((await GET(req("/api/meals/"))).status).toBe(401);
    const kid = await cookieFor("kid@example.com");
    expect((await put(kid, { date: "2026-11-17", slot: "snack", text: "Chips" })).status).toBe(400);
    expect((await put(kid, { date: "2026-13-40", slot: "dinner", text: "Tacos" })).status).toBe(400);
    expect((await put(kid, { date: "2026-11-17", slot: "dinner", text: "x".repeat(121) })).status).toBe(400);
  });

  it("clears plans more than two months old as new ones are written", async () => {
    await setMeal(LEGACY_ACCOUNT_ID, { date: "2026-09-01", slot: "dinner", text: "Old stew", by: "kid@example.com" });
    await setMeal(LEGACY_ACCOUNT_ID, { date: "2026-11-17", slot: "dinner", text: "Tacos", by: "kid@example.com" });
    expect((await query<{ date: string }>("SELECT date FROM account_meals")).map((r) => r.date)).toEqual(["2026-11-17"]);
    expect(await recentMeals(LEGACY_ACCOUNT_ID)).toEqual(["Tacos"]);
  });

  it("gives displays the plan from today with an ETag, and 304 when nothing changed", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-17T20:00:00Z"), toFake: ["Date"] });
    try {
      await setMeal(LEGACY_ACCOUNT_ID, { date: "2026-11-17", slot: "dinner", text: "Tacos", by: "admin@example.com" });
      await setMeal(LEGACY_ACCOUNT_ID, { date: "2026-11-16", slot: "dinner", text: "Yesterday's pizza", by: "admin@example.com" });
      const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
      const first = await displayGET(req("/api/display/meals/", { headers: { "x-display-token": token } }));
      const body = await first.json();
      expect(body).toEqual({ today: "2026-11-17", meals: { "2026-11-17": { dinner: "Tacos" } } });
      expect(JSON.stringify(body)).not.toContain("@example.com");
      const tag = first.headers.get("etag")!;
      const again = await displayGET(req("/api/display/meals/", { headers: { "x-display-token": token, "if-none-match": tag } }));
      expect(again.status).toBe(304);
      await setMeal(LEGACY_ACCOUNT_ID, { date: "2026-11-17", slot: "dinner", text: "Burgers", by: "admin@example.com" });
      const changed = await displayGET(req("/api/display/meals/", { headers: { "x-display-token": token, "if-none-match": tag } }));
      expect(changed.status).toBe(200);
      expect((await displayGET(req("/api/display/meals/"))).status).toBe(401);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows recurring meals on the display feed", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-23T18:00:00Z"), toFake: ["Date"] });
    try {
      const admin = await cookieFor("admin@example.com");
      expect(
        (await put(admin, { date: "2026-11-23", slot: "breakfast", text: "Cereal", repeat: { kind: "weekdays", days: [1] } })).status,
      ).toBe(200);
      const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
      const r = await displayGET(req("/api/display/meals/", { headers: { "x-display-token": token } }));
      const body = (await r.json()) as { meals: Record<string, Record<string, string>> };
      expect(body.meals["2026-11-23"]?.breakfast).toBe("Cereal");
      expect(body.meals["2026-11-30"]?.breakfast).toBe("Cereal");
    } finally {
      vi.useRealTimers();
    }
  });
});
