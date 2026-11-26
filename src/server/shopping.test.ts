import { describe, expect, it, vi } from "vitest";

import { GET as displayGET, POST as displayPOST } from "@/app/api/display/shopping/route";
import { DELETE as itemDELETE, PATCH } from "@/app/api/shopping/[id]/route";
import { POST as fromMealsPOST } from "@/app/api/shopping/from-meals/route";
import { POST as addPOST, DELETE as clearDELETE, GET as listGET } from "@/app/api/shopping/route";
import { defaultConfig } from "@/lib/config/defaults";
import type { DashboardConfig } from "@/lib/config/schema";
import type { ShoppingData } from "@/lib/display/types";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { cookieFor, req, useTestServer } from "@/test/server";

import { loadConfig, saveConfig } from "./config";
import { query, run } from "./db";
import { addDevice } from "./devices";
import { setMeal } from "./meals";
import {
  addShoppingFromMeals,
  addShoppingFromWall,
  addShoppingItem,
  clearDoneShopping,
  ITEM_MAX,
  listShopping,
  OPEN_MAX,
  removeShoppingItem,
  setShoppingDone,
  setShoppingDoneFromPhone,
  updateShoppingItem,
} from "./shopping";

const DAY = 86_400_000;
const NOON = Date.parse("2026-11-22T20:00:00Z");
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function withShopping(allowCheck = true, allowAdd = false): DashboardConfig {
  const c = defaultConfig();
  c.views[0]?.widgets.push({
    id: "shop",
    type: "shopping",
    x: 0,
    y: 0,
    w: 2,
    h: 2,
    showBackground: true,
    count: 12,
    allowCheck,
    allowAdd,
    showDone: false,
    groupByCategory: true,
  });
  return c;
}

describe("shopping list", () => {
  useTestServer();

  it("keeps open items in the order they were added, then bought ones", async () => {
    const milk = await addShoppingItem(LEGACY_ACCOUNT_ID, { text: "  milk   2%  ", by: "kid@example.com" }, NOON);
    const eggs = await addShoppingItem(LEGACY_ACCOUNT_ID, { text: "Eggs", by: "kid@example.com" }, NOON + 1);
    const bread = await addShoppingItem(LEGACY_ACCOUNT_ID, { text: "Bread", by: "kid@example.com" }, NOON + 2);
    expect(milk.ok && eggs.ok && bread.ok).toBe(true);
    if (!milk.ok || !eggs.ok || !bread.ok) return;
    expect(milk.item.text).toBe("milk 2%");
    expect(await setShoppingDone(LEGACY_ACCOUNT_ID, withShopping(), { id: milk.item.id, done: true }, NOON + 3)).toBe("ok");
    const list = await listShopping(LEGACY_ACCOUNT_ID, NOON + 4);
    expect(list.items.map((i) => [i.text, i.done])).toEqual([
      ["Eggs", false],
      ["Bread", false],
      ["milk 2%", true],
    ]);
    expect(list.updatedAt).toBe(NOON + 3);
    expect(JSON.stringify(list)).not.toContain("@example.com");

    expect(await setShoppingDone(LEGACY_ACCOUNT_ID, withShopping(), { id: milk.item.id, done: false }, NOON + 5)).toBe("ok");
    const undone = await query<{ done: number | bigint; done_at: number | null }>("SELECT done, done_at FROM shopping WHERE id = ?", [
      milk.item.id,
    ]);
    expect(Number(undone[0]?.done)).toBe(0);
    expect(undone[0]?.done_at).toBeNull();
    // Unticking puts it back among the open items, in the order it was added.
    expect((await listShopping(LEGACY_ACCOUNT_ID)).items.map((i) => i.text)).toEqual(["milk 2%", "Eggs", "Bread"]);

    expect(await removeShoppingItem(LEGACY_ACCOUNT_ID, eggs.item.id)).toBe(true);
    expect(await removeShoppingItem(LEGACY_ACCOUNT_ID, "missing")).toBe(false);
    expect(await setShoppingDone(LEGACY_ACCOUNT_ID, withShopping(), { id: bread.item.id, done: true }, NOON + 6)).toBe("ok");
    expect(await clearDoneShopping(LEGACY_ACCOUNT_ID)).toBe(1);
    expect((await listShopping(LEGACY_ACCOUNT_ID)).items.map((i) => i.text)).toEqual(["milk 2%"]);
  });

  it("refuses a wall tap when no shopping widget allows it, and an unknown item", async () => {
    const added = await addShoppingItem(LEGACY_ACCOUNT_ID, { text: "Milk", by: "a" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(await setShoppingDone(LEGACY_ACCOUNT_ID, defaultConfig(), { id: added.item.id, done: true })).toBe("forbidden");
    expect(await setShoppingDone(LEGACY_ACCOUNT_ID, withShopping(false), { id: added.item.id, done: true })).toBe("forbidden");
    expect((await listShopping(LEGACY_ACCOUNT_ID)).items[0]?.done).toBe(false);
    expect(await setShoppingDone(LEGACY_ACCOUNT_ID, withShopping(), { id: "nope", done: true })).toBe("not-found");
    expect(await setShoppingDoneFromPhone(LEGACY_ACCOUNT_ID, { id: added.item.id, done: true })).toBe("ok");
    expect((await listShopping(LEGACY_ACCOUNT_ID)).items[0]?.done).toBe(true);
  });

  it("drops bought items after a week and stops at 100 open items", async () => {
    const added = await addShoppingItem(LEGACY_ACCOUNT_ID, { text: "Yogurt", by: "a" }, NOON);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    await setShoppingDone(LEGACY_ACCOUNT_ID, withShopping(), { id: added.item.id, done: true }, NOON);
    expect((await listShopping(LEGACY_ACCOUNT_ID, NOON + 6 * DAY)).items).toHaveLength(1);
    expect(await listShopping(LEGACY_ACCOUNT_ID, NOON + 8 * DAY)).toEqual({ updatedAt: 0, items: [] });

    for (let i = 0; i < OPEN_MAX; i++) expect((await addShoppingItem(LEGACY_ACCOUNT_ID, { text: `Item ${i}`, by: "a" })).ok).toBe(true);
    expect(await addShoppingItem(LEGACY_ACCOUNT_ID, { text: "One more", by: "a" })).toEqual({ ok: false, error: "full" });
    expect(await addShoppingItem(LEGACY_ACCOUNT_ID, { text: "  ", by: "a" })).toEqual({ ok: false, error: "empty" });
    expect(await addShoppingItem(LEGACY_ACCOUNT_ID, { text: "x".repeat(ITEM_MAX + 1), by: "a" })).toEqual({ ok: false, error: "long" });
  });

  it("adds each distinct meal for the next week that isn't already open", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-22T20:00:00Z"), toFake: ["Date"] });
    try {
      await setMeal(LEGACY_ACCOUNT_ID, { date: "2026-11-22", slot: "breakfast", text: "Oatmeal", by: "kid@example.com" });
      await setMeal(LEGACY_ACCOUNT_ID, { date: "2026-11-22", slot: "dinner", text: "Tacos", by: "kid@example.com" });
      await setMeal(LEGACY_ACCOUNT_ID, { date: "2026-11-23", slot: "dinner", text: "tacos", by: "kid@example.com" });
      await setMeal(LEGACY_ACCOUNT_ID, { date: "2026-11-28", slot: "lunch", text: "Soup", by: "kid@example.com" });
      await setMeal(LEGACY_ACCOUNT_ID, { date: "2026-11-29", slot: "dinner", text: "Too late", by: "kid@example.com" });
      await setMeal(LEGACY_ACCOUNT_ID, { date: "2026-11-21", slot: "dinner", text: "Yesterday", by: "kid@example.com" });
      await run("INSERT INTO meals (date, slot, text, updated_at, updated_by) VALUES (?, 'lunch', '   ', 1, 'a')", ["2026-11-24"]);
      await addShoppingItem(LEGACY_ACCOUNT_ID, { text: "oatmeal", by: "a" });
      const long = "L".repeat(90);
      await setMeal(LEGACY_ACCOUNT_ID, { date: "2026-11-25", slot: "dinner", text: long, by: "a" });
      expect(await addShoppingFromMeals(LEGACY_ACCOUNT_ID, defaultConfig(), "kid@example.com")).toBe(3);
      const texts = (await listShopping(LEGACY_ACCOUNT_ID)).items.filter((i) => !i.done).map((i) => i.text);
      expect(texts).toEqual(["oatmeal", "Tacos", "L".repeat(ITEM_MAX), "Soup"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops copying meals once the open list is full", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-22T20:00:00Z"), toFake: ["Date"] });
    try {
      for (let i = 0; i < OPEN_MAX; i++) await addShoppingItem(LEGACY_ACCOUNT_ID, { text: `Item ${i}`, by: "a" });
      await setMeal(LEGACY_ACCOUNT_ID, { date: "2026-11-22", slot: "dinner", text: "Tacos", by: "a" });
      expect(await addShoppingFromMeals(LEGACY_ACCOUNT_ID, defaultConfig())).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("shopping aisles and running low", () => {
  useTestServer();

  it("guesses an aisle, keeps a picked one for the same item next time, and marks running low", async () => {
    const milk = await addShoppingItem(LEGACY_ACCOUNT_ID, { text: "Oat milk", by: "kid@example.com" }, NOON);
    const card = await addShoppingItem(LEGACY_ACCOUNT_ID, { text: "Birthday card", by: "kid@example.com", low: true }, NOON + 1);
    if (!milk.ok || !card.ok) throw new Error("not added");
    expect([milk.item.category, card.item.category, card.item.low]).toEqual(["dairy", "other", true]);

    expect(await updateShoppingItem(LEGACY_ACCOUNT_ID, { id: milk.item.id, category: "drinks", low: true })).toBe("ok");
    expect(await updateShoppingItem(LEGACY_ACCOUNT_ID, { id: "missing", low: true })).toBe("not-found");
    let list = await listShopping(LEGACY_ACCOUNT_ID, NOON + 2);
    expect(list.items.map((i) => [i.text, i.category, i.low])).toEqual([
      ["Oat milk", "drinks", true],
      ["Birthday card", "other", true],
    ]);

    // Bought, then added again with other capitals: the aisle someone picked comes back, "low" doesn't.
    await setShoppingDoneFromPhone(LEGACY_ACCOUNT_ID, { id: milk.item.id, done: true }, NOON + 3);
    const again = await addShoppingItem(LEGACY_ACCOUNT_ID, { text: "oat milk", by: "kid@example.com" }, NOON + 4);
    expect(again.ok && [again.item.category, again.item.low]).toEqual(["drinks", false]);
    list = await listShopping(LEGACY_ACCOUNT_ID, NOON + 5);
    expect(list.items.find((i) => i.text === "oat milk")?.category).toBe("drinks");
  });

  it("guesses aisles for items saved before categories", async () => {
    await run(
      "INSERT INTO shopping (id, account_id, text, done, sort, added_at, done_at, added_by) VALUES ('old', ?, 'Bananas', 0, 1, ?, NULL, 'x')",
      [LEGACY_ACCOUNT_ID, NOON],
    );
    const list = await listShopping(LEGACY_ACCOUNT_ID, NOON + 1);
    expect(list.items).toEqual([{ id: "old", text: "Bananas", done: false, category: "produce", low: false }]);
  });

  it("moves aisle and marks low from a phone, and takes a running-low add from the wall", async () => {
    const kid = await cookieFor("kid@example.com");
    const headers = { cookie: kid };
    const posted = await addPOST(
      req("/api/shopping/", { method: "POST", headers, body: JSON.stringify({ text: "Tea", category: "pantry", low: true }) }),
    );
    expect(posted.status).toBe(201);
    const { item } = (await posted.json()) as { item: { id: string; category: string; low: boolean } };
    expect([item.category, item.low]).toEqual(["pantry", true]);
    expect(
      (
        await PATCH(
          req("/api/shopping/", { method: "PATCH", headers, body: JSON.stringify({ category: "drinks", low: false }) }),
          ctx(item.id),
        )
      ).status,
    ).toBe(200);
    expect(
      (await PATCH(req("/api/shopping/", { method: "PATCH", headers, body: JSON.stringify({ category: "aisle 9" }) }), ctx(item.id)))
        .status,
    ).toBe(400);
    expect((await PATCH(req("/api/shopping/", { method: "PATCH", headers, body: JSON.stringify({}) }), ctx(item.id))).status).toBe(400);
    expect(
      (await PATCH(req("/api/shopping/", { method: "PATCH", headers, body: JSON.stringify({ low: true }) }), ctx("missing"))).status,
    ).toBe(404);
    const listed = (await (await listGET(req("/api/shopping/", { headers }))).json()) as ShoppingData;
    expect(listed.items.map((i) => [i.text, i.category, i.low])).toEqual([["Tea", "drinks", false]]);

    const wall = await addShoppingFromWall(LEGACY_ACCOUNT_ID, withShopping(true, true), { text: "Coffee", low: true });
    expect(wall.ok && [wall.item.category, wall.item.low]).toEqual(["drinks", true]);
  });
});

describe("/api/shopping/", () => {
  useTestServer();

  it("lets family add, tick, remove and clear, without showing an email", async () => {
    const kid = await cookieFor("kid@example.com");
    const headers = { cookie: kid };
    expect((await listGET(req("/api/shopping/"))).status).toBe(401);
    const posted = await addPOST(req("/api/shopping/", { method: "POST", headers, body: JSON.stringify({ text: "  Milk " }) }));
    expect(posted.status).toBe(201);
    const { item } = (await posted.json()) as { item: { id: string; text: string; done: boolean } };
    expect(item).toMatchObject({ text: "Milk", done: false });
    expect(JSON.stringify(item)).not.toContain("@example.com");
    await addPOST(req("/api/shopping/", { method: "POST", headers, body: JSON.stringify({ text: "Eggs" }) }));

    expect(
      (await PATCH(req("/api/shopping/", { method: "PATCH", headers, body: JSON.stringify({ done: true }) }), ctx(item.id))).status,
    ).toBe(200);
    const listed = (await (await listGET(req("/api/shopping/", { headers }))).json()) as ShoppingData;
    expect(listed.items.map((i) => [i.text, i.done])).toEqual([
      ["Eggs", false],
      ["Milk", true],
    ]);

    expect((await itemDELETE(req("/api/shopping/", { method: "DELETE", headers }), ctx("missing"))).status).toBe(404);
    expect((await clearDELETE(req("/api/shopping/?done=1", { method: "DELETE", headers }))).status).toBe(200);
    expect(((await (await listGET(req("/api/shopping/", { headers }))).json()) as ShoppingData).items.map((i) => i.text)).toEqual(["Eggs"]);
    const eggs = ((await (await listGET(req("/api/shopping/", { headers }))).json()) as ShoppingData).items[0];
    expect((await itemDELETE(req("/api/shopping/", { method: "DELETE", headers }), ctx(eggs?.id ?? ""))).status).toBe(200);
    expect(((await (await listGET(req("/api/shopping/", { headers }))).json()) as ShoppingData).items).toEqual([]);
  });

  it("refuses signed-out people, other sites, empty items and a clear with no target", async () => {
    const kid = await cookieFor("kid@example.com");
    expect((await addPOST(req("/api/shopping/", { method: "POST", body: JSON.stringify({ text: "Milk" }) }))).status).toBe(401);
    expect(
      (
        await addPOST(
          req("/api/shopping/", {
            method: "POST",
            headers: { cookie: kid, origin: "https://evil.example" },
            body: JSON.stringify({ text: "Milk" }),
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (await addPOST(req("/api/shopping/", { method: "POST", headers: { cookie: kid }, body: JSON.stringify({ text: "  " }) }))).status,
    ).toBe(400);
    expect(
      (await addPOST(req("/api/shopping/", { method: "POST", headers: { cookie: kid }, body: JSON.stringify({ text: "x".repeat(81) }) })))
        .status,
    ).toBe(400);
    expect((await clearDELETE(req("/api/shopping/", { method: "DELETE", headers: { cookie: kid } }))).status).toBe(400);
    expect(
      (await PATCH(req("/api/shopping/", { method: "PATCH", headers: { cookie: kid }, body: '{"done":"yes"}' }), ctx("x"))).status,
    ).toBe(400);
    expect((await fromMealsPOST(req("/api/shopping/from-meals/", { method: "POST" }))).status).toBe(401);
  });

  it("adds this week's meals from a phone", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-22T20:00:00Z"), toFake: ["Date"] });
    try {
      await setMeal(LEGACY_ACCOUNT_ID, { date: "2026-11-22", slot: "dinner", text: "Tacos", by: "kid@example.com" });
      const kid = await cookieFor("kid@example.com");
      const r = await fromMealsPOST(req("/api/shopping/from-meals/", { method: "POST", headers: { cookie: kid } }));
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ added: 1 });
      expect(
        ((await (await listGET(req("/api/shopping/", { headers: { cookie: kid } }))).json()) as ShoppingData).items.map((i) => i.text),
      ).toEqual(["Tacos"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("/api/display/shopping/", () => {
  useTestServer();

  async function setUp(allowCheck = true) {
    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    const saved = await saveConfig(LEGACY_ACCOUNT_ID, withShopping(allowCheck), stored.version);
    expect(saved.ok).toBe(true);
    return (await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null)).token;
  }

  it("needs a display or a signed-in person", async () => {
    expect((await displayGET(req("/api/display/shopping/"))).status).toBe(401);
    expect(
      (await displayPOST(req("/api/display/shopping/", { method: "POST", body: JSON.stringify({ id: "a", done: true }) }))).status,
    ).toBe(401);
  });

  it("ticks an item from the wall and answers 304 while nothing changes", async () => {
    const token = await setUp();
    const headers = { "x-display-token": token };
    const added = await addShoppingItem(LEGACY_ACCOUNT_ID, { text: "Milk", by: "kid@example.com" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const first = await displayGET(req("/api/display/shopping/", { headers }));
    const tag = first.headers.get("etag") ?? "";
    const data = (await first.json()) as ShoppingData;
    expect(data.items).toEqual([{ id: added.item.id, text: "Milk", done: false, category: "dairy", low: false }]);
    expect(JSON.stringify(data)).not.toContain("@example.com");
    expect((await displayGET(req("/api/display/shopping/", { headers: { ...headers, "if-none-match": tag } }))).status).toBe(304);

    const tick = await displayPOST(
      req("/api/display/shopping/", { method: "POST", headers, body: JSON.stringify({ id: added.item.id, done: true }) }),
    );
    expect(tick.status).toBe(200);
    const after = await displayGET(req("/api/display/shopping/", { headers: { ...headers, "if-none-match": tag } }));
    expect(after.status).toBe(200);
    expect(((await after.json()) as ShoppingData).items[0]?.done).toBe(true);
  });

  it("refuses another site, a malformed tap, a missing item and a widget that doesn't allow taps", async () => {
    const token = await setUp(false);
    const headers = { "x-display-token": token };
    const added = await addShoppingItem(LEGACY_ACCOUNT_ID, { text: "Milk", by: "a" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const foreign = await displayPOST(
      req("/api/display/shopping/", {
        method: "POST",
        headers: { ...headers, origin: "https://evil.example" },
        body: JSON.stringify({ id: added.item.id, done: true }),
      }),
    );
    expect(foreign.status).toBe(403);
    expect((await displayPOST(req("/api/display/shopping/", { method: "POST", headers, body: '{"id":1}' }))).status).toBe(400);
    const blocked = await displayPOST(
      req("/api/display/shopping/", { method: "POST", headers, body: JSON.stringify({ id: added.item.id, done: true }) }),
    );
    expect(blocked.status).toBe(403);
    expect((await listShopping(LEGACY_ACCOUNT_ID)).items[0]?.done).toBe(false);

    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    expect((await saveConfig(LEGACY_ACCOUNT_ID, withShopping(true), stored.version)).ok).toBe(true);
    expect(
      (await displayPOST(req("/api/display/shopping/", { method: "POST", headers, body: JSON.stringify({ id: "nope", done: true }) })))
        .status,
    ).toBe(404);
  });

  it("adds from the wall when allowAdd is on", async () => {
    const token = await setUp(true);
    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    const saved = await saveConfig(LEGACY_ACCOUNT_ID, withShopping(true, true), stored.version);
    expect(saved.ok).toBe(true);
    const headers = { "x-display-token": token };
    const add = await displayPOST(req("/api/display/shopping/", { method: "POST", headers, body: JSON.stringify({ text: "Butter" }) }));
    expect(add.status).toBe(201);
    const data = (await (await displayGET(req("/api/display/shopping/", { headers }))).json()) as ShoppingData;
    expect(data.items.map((i) => i.text)).toContain("Butter");
  });

  it("refuses add without allowAdd", async () => {
    const token = await setUp(true);
    const headers = { "x-display-token": token };
    const add = await displayPOST(req("/api/display/shopping/", { method: "POST", headers, body: JSON.stringify({ text: "Butter" }) }));
    expect(add.status).toBe(403);
    expect((await addShoppingFromWall(LEGACY_ACCOUNT_ID, withShopping(true, false), { text: "X" })).ok).toBe(false);
  });
});
