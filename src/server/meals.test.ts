import { describe, expect, it, vi } from "vitest";

import { GET as displayGET } from "@/app/api/display/meals/route";
import { GET, PUT } from "@/app/api/meals/route";
import { nextMeal } from "@/lib/meals";
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
    const body = (await r.json()) as { from: string; meals: unknown; recent: string[] };
    expect(body.from).toBe("2026-11-17");
    expect(body.meals).toEqual({ "2026-11-17": { breakfast: "Oatmeal", dinner: "Spaghetti" }, "2026-11-18": { lunch: "Soup" } });
    expect(body.recent).toEqual(expect.arrayContaining(["Spaghetti", "Soup", "Oatmeal"]));
    expect(body.recent).not.toContain("Tacos");
    expect((await put(kid, { date: "2026-11-18", slot: "lunch", text: "" })).status).toBe(200);
    expect(await mealsBetween("2026-11-18", 1)).toEqual({});
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
    await setMeal({ date: "2026-09-01", slot: "dinner", text: "Old stew", by: "kid@example.com" });
    await setMeal({ date: "2026-11-17", slot: "dinner", text: "Tacos", by: "kid@example.com" });
    expect((await query<{ date: string }>("SELECT date FROM meals")).map((r) => r.date)).toEqual(["2026-11-17"]);
    expect(await recentMeals()).toEqual(["Tacos"]);
  });

  it("gives displays the plan from today with an ETag, and 304 when nothing changed", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-17T20:00:00Z"), toFake: ["Date"] });
    try {
      await setMeal({ date: "2026-11-17", slot: "dinner", text: "Tacos", by: "admin@example.com" });
      await setMeal({ date: "2026-11-16", slot: "dinner", text: "Yesterday's pizza", by: "admin@example.com" });
      const { token } = await addDevice("Kitchen", null);
      const first = await displayGET(req("/api/display/meals/", { headers: { "x-display-token": token } }));
      const body = await first.json();
      expect(body).toEqual({ today: "2026-11-17", meals: { "2026-11-17": { dinner: "Tacos" } } });
      expect(JSON.stringify(body)).not.toContain("@example.com");
      const tag = first.headers.get("etag")!;
      const again = await displayGET(req("/api/display/meals/", { headers: { "x-display-token": token, "if-none-match": tag } }));
      expect(again.status).toBe(304);
      await setMeal({ date: "2026-11-17", slot: "dinner", text: "Burgers", by: "admin@example.com" });
      const changed = await displayGET(req("/api/display/meals/", { headers: { "x-display-token": token, "if-none-match": tag } }));
      expect(changed.status).toBe(200);
      expect((await displayGET(req("/api/display/meals/"))).status).toBe(401);
    } finally {
      vi.useRealTimers();
    }
  });

  it("knows which meal is next", () => {
    expect([6, 10, 13, 14, 19, 20, 23].map((h) => nextMeal(h))).toEqual([
      { slot: "breakfast", tomorrow: false },
      { slot: "lunch", tomorrow: false },
      { slot: "lunch", tomorrow: false },
      { slot: "dinner", tomorrow: false },
      { slot: "dinner", tomorrow: false },
      { slot: "breakfast", tomorrow: true },
      { slot: "breakfast", tomorrow: true },
    ]);
  });
});
