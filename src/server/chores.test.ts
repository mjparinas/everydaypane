import { describe, expect, it } from "vitest";

import { GET, POST } from "@/app/api/display/chores/route";
import { defaultConfig } from "@/lib/config/defaults";
import type { DashboardConfig } from "@/lib/config/schema";
import type { ChoresData } from "@/lib/display/types";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { req, useTestServer } from "@/test/server";

import { setChoresPin, verifyChoresPin } from "./chorePin";
import { choreBoard, redeemChoreReward, setChoreDone } from "./chores";
import { loadConfig, saveConfig } from "./config";
import { addDevice } from "./devices";

// Noon in Vancouver on Wednesday 2026-11-18 (B.C. is on UTC−7 all year from 2026).
const WED = Date.parse("2026-11-18T19:00:00Z");
const THU = WED + 86_400_000;
const NEXT_MON = Date.parse("2026-11-23T19:00:00Z");

function withChores(allowCheck = true): DashboardConfig {
  const c = defaultConfig();
  c.chores = {
    people: [
      { id: "ana", name: "Ana", emoji: "🦊", color: "#e8590c", goal: 10 },
      { id: "ben", name: "Ben", emoji: "", color: "#1c7ed6", goal: 0 },
    ],
    items: [
      {
        id: "bed",
        name: "Make the bed",
        emoji: "🛏️",
        stars: 1,
        days: [0, 1, 2, 3, 4, 5, 6],
        personIds: ["ana", "ben"],
        rotate: "none",
        period: "morning",
      },
      {
        id: "dishes",
        name: "Dishes",
        emoji: "",
        stars: 3,
        days: [0, 1, 2, 3, 4, 5, 6],
        personIds: ["ana", "ben"],
        rotate: "day",
        period: "evening",
      },
      { id: "lawn", name: "Mow the lawn", emoji: "", stars: 5, days: [6], personIds: ["ben"], rotate: "none", period: "anytime" },
    ],
    rewards: [{ id: "tv", name: "Extra TV", starsCost: 4 }],
    pinSet: false,
  };
  c.views[0]?.widgets.push({
    id: "ch",
    type: "chores",
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    showBackground: true,
    personIds: [],
    showStars: true,
    allowCheck,
    layout: "columns",
  });
  return c;
}

describe("choreBoard", () => {
  useTestServer();

  it("lists only today's chores, who has them, and nothing done yet", async () => {
    const board = await choreBoard(LEGACY_ACCOUNT_ID, withChores(), WED);
    expect(board.today).toBe("2026-11-18");
    expect(board.chores.map((c) => c.id)).toEqual(["bed", "dishes"]);
    expect(board.due).toEqual([
      { choreId: "bed", personId: "ana", done: false },
      { choreId: "bed", personId: "ben", done: false },
      { choreId: "dishes", personId: "ana", done: false },
    ]);
    expect(board.people.map((p) => [p.name, p.stars])).toEqual([
      ["Ana", 0],
      ["Ben", 0],
    ]);
  });

  it("counts the stars ticked off this week and starts again on Monday", async () => {
    const config = withChores();
    expect(await setChoreDone(LEGACY_ACCOUNT_ID, config, { chore: "dishes", person: "ana", done: true }, WED)).toBe("ok");
    expect(await setChoreDone(LEGACY_ACCOUNT_ID, config, { chore: "bed", person: "ana", done: true }, WED)).toBe("ok");
    expect(await setChoreDone(LEGACY_ACCOUNT_ID, config, { chore: "bed", person: "ana", done: true }, THU)).toBe("ok");
    const wed = await choreBoard(LEGACY_ACCOUNT_ID, config, WED);
    expect(wed.due.find((d) => d.choreId === "dishes")?.done).toBe(true);
    expect(wed.people.find((p) => p.id === "ana")?.stars).toBe(4);
    expect((await choreBoard(LEGACY_ACCOUNT_ID, config, THU)).people.find((p) => p.id === "ana")?.stars).toBe(5);
    expect((await choreBoard(LEGACY_ACCOUNT_ID, config, NEXT_MON)).people.find((p) => p.id === "ana")?.stars).toBe(0);
  });

  it("keeps the stars a chore was worth when it was done", async () => {
    const config = withChores();
    await setChoreDone(LEGACY_ACCOUNT_ID, config, { chore: "dishes", person: "ana", done: true }, WED);
    const dishes = config.chores.items.find((i) => i.id === "dishes");
    if (dishes) dishes.stars = 1;
    expect((await choreBoard(LEGACY_ACCOUNT_ID, config, WED)).people.find((p) => p.id === "ana")?.stars).toBe(3);
  });

  it("takes a tick back", async () => {
    const config = withChores();
    await setChoreDone(LEGACY_ACCOUNT_ID, config, { chore: "bed", person: "ben", done: true }, WED);
    await setChoreDone(LEGACY_ACCOUNT_ID, config, { chore: "bed", person: "ben", done: false }, WED);
    const board = await choreBoard(LEGACY_ACCOUNT_ID, config, WED);
    expect(board.due.find((d) => d.personId === "ben")?.done).toBe(false);
    expect(board.people.find((p) => p.id === "ben")?.stars).toBe(0);
  });

  it("counts a chore once however many times it is tapped", async () => {
    const config = withChores();
    await setChoreDone(LEGACY_ACCOUNT_ID, config, { chore: "bed", person: "ben", done: true }, WED);
    await setChoreDone(LEGACY_ACCOUNT_ID, config, { chore: "bed", person: "ben", done: true }, WED + 1000);
    expect((await choreBoard(LEGACY_ACCOUNT_ID, config, WED)).people.find((p) => p.id === "ben")?.stars).toBe(1);
  });
});

describe("setChoreDone", () => {
  useTestServer();

  it("refuses a chore that isn't that person's today", async () => {
    const config = withChores();
    expect(await setChoreDone(LEGACY_ACCOUNT_ID, config, { chore: "dishes", person: "ben", done: true }, WED)).toBe("forbidden"); // Ana's turn
    expect(await setChoreDone(LEGACY_ACCOUNT_ID, config, { chore: "lawn", person: "ben", done: true }, WED)).toBe("forbidden"); // Saturdays
    expect(await setChoreDone(LEGACY_ACCOUNT_ID, config, { chore: "nope", person: "ben", done: true }, WED)).toBe("forbidden");
  });

  it("refuses when no chores widget allows ticking, or none shows that person", async () => {
    expect(await setChoreDone(LEGACY_ACCOUNT_ID, withChores(false), { chore: "bed", person: "ana", done: true }, WED)).toBe("forbidden");
    const config = withChores();
    const w = config.views[0]?.widgets.find((x) => x.type === "chores");
    if (w?.type === "chores") w.personIds = ["ben"];
    expect(await setChoreDone(LEGACY_ACCOUNT_ID, config, { chore: "bed", person: "ana", done: true }, WED)).toBe("forbidden");
    expect(await setChoreDone(LEGACY_ACCOUNT_ID, config, { chore: "bed", person: "ben", done: true }, WED)).toBe("ok");
  });
});

describe("/api/display/chores/", () => {
  useTestServer();

  async function setUp() {
    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    const saved = await saveConfig(LEGACY_ACCOUNT_ID, withChores(), stored.version);
    expect(saved.ok).toBe(true);
    return (await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null)).token;
  }

  it("needs a display or a signed-in person", async () => {
    expect((await GET(req("/api/display/chores/"))).status).toBe(401);
    const r = await POST(
      req("/api/display/chores/", { method: "POST", body: JSON.stringify({ chore: "bed", person: "ana", done: true }) }),
    );
    expect(r.status).toBe(401);
  });

  it("ticks a chore off from the wall and answers 304 while nothing changes", async () => {
    const token = await setUp();
    const headers = { "x-display-token": token };
    const first = await GET(req("/api/display/chores/", { headers }));
    const tag = first.headers.get("etag") ?? "";
    expect(((await first.json()) as ChoresData).due.some((d) => d.choreId === "bed" && d.personId === "ana" && !d.done)).toBe(true);
    expect((await GET(req("/api/display/chores/", { headers: { ...headers, "if-none-match": tag } }))).status).toBe(304);

    const tick = await POST(
      req("/api/display/chores/", { method: "POST", headers, body: JSON.stringify({ chore: "bed", person: "ana", done: true }) }),
    );
    expect(tick.status).toBe(200);
    const after = await GET(req("/api/display/chores/", { headers: { ...headers, "if-none-match": tag } }));
    expect(after.status).toBe(200);
    const data = (await after.json()) as ChoresData;
    expect(data.due.find((d) => d.choreId === "bed" && d.personId === "ana")?.done).toBe(true);
    expect(data.people.find((p) => p.id === "ana")?.stars).toBe(1);
  });

  it("refuses a request from another site and a malformed tap", async () => {
    const token = await setUp();
    const foreign = await POST(
      req("/api/display/chores/", {
        method: "POST",
        headers: { "x-display-token": token, origin: "https://evil.example" },
        body: JSON.stringify({ chore: "bed", person: "ana", done: true }),
      }),
    );
    expect(foreign.status).toBe(403);
    const bad = await POST(req("/api/display/chores/", { method: "POST", headers: { "x-display-token": token }, body: '{"chore":1}' }));
    expect(bad.status).toBe(400);
  });
});

describe("rewards and PIN", () => {
  useTestServer();

  it("redeems when enough stars are available", async () => {
    const config = withChores();
    await setChoreDone(LEGACY_ACCOUNT_ID, config, { chore: "dishes", person: "ana", done: true }, WED);
    await setChoreDone(LEGACY_ACCOUNT_ID, config, { chore: "bed", person: "ana", done: true }, WED);
    expect(await redeemChoreReward(LEGACY_ACCOUNT_ID, config, { reward: "tv", person: "ana" }, WED)).toBe("ok");
    const board = await choreBoard(LEGACY_ACCOUNT_ID, config, WED);
    expect(board.people.find((p) => p.id === "ana")?.available).toBe(0);
    expect(board.people.find((p) => p.id === "ana")?.stars).toBe(4);
  });

  it("refuses redeem without enough stars", async () => {
    const config = withChores();
    expect(await redeemChoreReward(LEGACY_ACCOUNT_ID, config, { reward: "tv", person: "ana" }, WED)).toBe("stars");
  });

  it("requires the PIN to uncheck when pinSet", async () => {
    const config = withChores();
    config.chores.pinSet = true;
    await setChoresPin(LEGACY_ACCOUNT_ID, "1234");
    await setChoreDone(LEGACY_ACCOUNT_ID, config, { chore: "bed", person: "ana", done: true }, WED);
    expect(await setChoreDone(LEGACY_ACCOUNT_ID, config, { chore: "bed", person: "ana", done: false }, WED)).toBe("pin");
    expect(await setChoreDone(LEGACY_ACCOUNT_ID, config, { chore: "bed", person: "ana", done: false, pin: "9999" }, WED)).toBe("pin");
    expect(await setChoreDone(LEGACY_ACCOUNT_ID, config, { chore: "bed", person: "ana", done: false, pin: "1234" }, WED)).toBe("ok");
    expect(await verifyChoresPin(LEGACY_ACCOUNT_ID, "1234")).toBe(true);
  });
});
