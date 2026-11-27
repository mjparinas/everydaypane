import { describe, expect, it } from "vitest";

import { GET, POST } from "@/app/api/display/whiteboard/route";
import { GET as PHONE_GET, POST as PHONE_POST } from "@/app/api/whiteboard/route";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { cookieFor, req, useTestServer } from "@/test/server";

import { run } from "./db";
import { addDevice } from "./devices";
import { appendStroke, clearWhiteboard, getWhiteboard, sanitizeStroke } from "./whiteboard";

const stroke = (id: string, colour = "#111111") => ({
  id,
  tool: "pen" as const,
  colour,
  points: [10, 20, 40, 50],
  width: 10,
});

describe("whiteboard", () => {
  useTestServer();

  it("starts empty and keeps strokes until cleared", async () => {
    const first = await getWhiteboard(LEGACY_ACCOUNT_ID);
    expect(first.strokes).toEqual([]);
    expect(first.revision).toBe(1);

    const added = await appendStroke(LEGACY_ACCOUNT_ID, first.revision, stroke("s1"));
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.data.strokes.map((s) => s.id)).toEqual(["s1"]);

    const again = await appendStroke(LEGACY_ACCOUNT_ID, added.data.revision, stroke("s2", "#e11d48"));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.data.strokes.map((s) => s.id)).toEqual(["s1", "s2"]);

    const wiped = await clearWhiteboard(LEGACY_ACCOUNT_ID, again.data.revision);
    expect(wiped.ok).toBe(true);
    if (!wiped.ok) return;
    expect(wiped.data.strokes).toEqual([]);
    expect(wiped.data.revision).toBe(again.data.revision + 1);
  });

  it("refuses a stroke or clear against a stale revision", async () => {
    const base = await getWhiteboard(LEGACY_ACCOUNT_ID);
    await appendStroke(LEGACY_ACCOUNT_ID, base.revision, stroke("a"));
    const cleared = await clearWhiteboard(LEGACY_ACCOUNT_ID, base.revision);
    expect(cleared.ok).toBe(true);

    const staleStroke = await appendStroke(LEGACY_ACCOUNT_ID, base.revision, stroke("late"));
    expect(staleStroke.ok).toBe(false);
    if (staleStroke.ok) return;
    expect(staleStroke.reason).toBe("stale");
    expect(staleStroke.data.strokes).toEqual([]);

    const staleClear = await clearWhiteboard(LEGACY_ACCOUNT_ID, base.revision);
    expect(staleClear.ok).toBe(false);
  });

  it.each([false, true])("keeps simultaneous strokes with the same timestamp (board already saved: %s)", async (saved) => {
    const account = "acct_concurrent";
    await getWhiteboard(account);
    if (saved) await appendStroke(account, 1, stroke("original"), 10);
    const writes = await Promise.all([appendStroke(account, 1, stroke("phone"), 10), appendStroke(account, 1, stroke("wall"), 10)]);
    expect(writes.map((result) => result.ok)).toEqual([true, true]);
    expect((await getWhiteboard(account)).strokes.map((s) => s.id).sort()).toEqual(
      saved ? ["original", "phone", "wall"] : ["phone", "wall"],
    );
  });

  it("keeps the board cleared when a stroke arrives alongside Clear", async () => {
    const account = "acct_concurrent";
    await appendStroke(account, 1, stroke("original"), 10);
    const [clear] = await Promise.all([clearWhiteboard(account, 1, 20), appendStroke(account, 1, stroke("incoming"), 20)]);
    expect(clear.ok).toBe(true);
    expect(await getWhiteboard(account)).toEqual({ revision: 2, updatedAt: 20, strokes: [] });
  });

  it("sanitises strokes from the wall", () => {
    expect(sanitizeStroke(stroke("stroke1"))).toMatchObject({ id: "stroke1", tool: "pen", colour: "#111111" });
    expect(sanitizeStroke({ ...stroke("bad-colour"), colour: "#fff" })).toBeNull();
    expect(sanitizeStroke({ ...stroke("short-pts"), points: [1] })).toBeNull();
    expect(sanitizeStroke({ ...stroke("erase-me"), tool: "erase", colour: "#111111" })?.tool).toBe("erase");
  });

  it("serves the board to a display and accepts a stroke", async () => {
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const headers = { "x-display-token": token };

    const empty = await GET(req("/api/display/whiteboard/", { headers }));
    expect(empty.status).toBe(200);
    const body = (await empty.json()) as { revision: number; strokes: unknown[] };
    expect(body.strokes).toEqual([]);

    const post = await POST(
      req("/api/display/whiteboard/", {
        method: "POST",
        headers,
        body: JSON.stringify({ op: "stroke", revision: body.revision, stroke: stroke("wall1") }),
      }),
    );
    expect(post.status).toBe(200);
    expect((await getWhiteboard(LEGACY_ACCOUNT_ID)).strokes.map((s) => s.id)).toEqual(["wall1"]);

    const clear = await POST(
      req("/api/display/whiteboard/", {
        method: "POST",
        headers,
        body: JSON.stringify({ op: "clear", revision: body.revision }),
      }),
    );
    expect(clear.status).toBe(200);
    expect((await getWhiteboard(LEGACY_ACCOUNT_ID)).strokes).toEqual([]);
  });

  it("keeps each household's board to itself", async () => {
    await appendStroke("acct_a", 1, stroke("only-a"));
    expect((await getWhiteboard("acct_a")).strokes.map((s) => s.id)).toEqual(["only-a"]);
    expect((await getWhiteboard("acct_b")).strokes).toEqual([]);
  });

  it("carries the old shared board over to the grandfather household only", async () => {
    await getWhiteboard(LEGACY_ACCOUNT_ID); // creates the tables
    await run("INSERT INTO whiteboard (id, revision, json, updated_at) VALUES (1, 3, ?, 5)", [JSON.stringify([stroke("old1")])]);
    const legacy = await getWhiteboard(LEGACY_ACCOUNT_ID);
    expect(legacy.revision).toBe(3);
    expect(legacy.strokes.map((s) => s.id)).toEqual(["old1"]);
    expect((await getWhiteboard("acct_other")).strokes).toEqual([]);
  });

  it("lets a family phone draw on the wall's board", async () => {
    const cookie = await cookieFor("kid@example.com");
    const empty = await PHONE_GET(req("/api/whiteboard/", { headers: { cookie } }));
    expect(empty.status).toBe(200);
    const board = (await empty.json()) as { revision: number };
    const post = await PHONE_POST(
      req("/api/whiteboard/", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({ op: "stroke", revision: board.revision, stroke: stroke("phone1") }),
      }),
    );
    expect(post.status).toBe(200);

    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const wall = (await (await GET(req("/api/display/whiteboard/", { headers: { "x-display-token": token } }))).json()) as {
      strokes: { id: string }[];
    };
    expect(wall.strokes.map((s) => s.id)).toEqual(["phone1"]);
  });

  it("lets the kitchen edit link clear the board, and refuses strangers", async () => {
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const headers = { "x-display-token": token };
    await appendStroke(LEGACY_ACCOUNT_ID, 1, stroke("wall2"));
    const clear = await PHONE_POST(
      req("/api/whiteboard/", { method: "POST", headers, body: JSON.stringify({ op: "clear", revision: 1 }) }),
    );
    expect(clear.status).toBe(200);
    expect((await getWhiteboard(LEGACY_ACCOUNT_ID)).strokes).toEqual([]);

    expect((await PHONE_GET(req("/api/whiteboard/"))).status).toBe(401);
    const foreign = await PHONE_POST(
      req("/api/whiteboard/", { method: "POST", headers: { ...headers, origin: "https://evil.example" }, body: "{}" }),
    );
    expect(foreign.status).toBe(403);
  });
});
