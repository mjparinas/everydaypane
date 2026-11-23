import { describe, expect, it } from "vitest";

import { GET, POST } from "@/app/api/display/whiteboard/route";
import { req, useTestServer } from "@/test/server";

import { LEGACY_ACCOUNT_ID } from "@/server/accounts";

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
    const first = await getWhiteboard();
    expect(first.strokes).toEqual([]);
    expect(first.revision).toBe(1);

    const added = await appendStroke(first.revision, stroke("s1"));
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.data.strokes.map((s) => s.id)).toEqual(["s1"]);

    const again = await appendStroke(added.data.revision, stroke("s2", "#e11d48"));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.data.strokes.map((s) => s.id)).toEqual(["s1", "s2"]);

    const wiped = await clearWhiteboard(again.data.revision);
    expect(wiped.ok).toBe(true);
    if (!wiped.ok) return;
    expect(wiped.data.strokes).toEqual([]);
    expect(wiped.data.revision).toBe(again.data.revision + 1);
  });

  it("refuses a stroke or clear against a stale revision", async () => {
    const base = await getWhiteboard();
    await appendStroke(base.revision, stroke("a"));
    const cleared = await clearWhiteboard(base.revision);
    expect(cleared.ok).toBe(true);

    const staleStroke = await appendStroke(base.revision, stroke("late"));
    expect(staleStroke.ok).toBe(false);
    if (staleStroke.ok) return;
    expect(staleStroke.reason).toBe("stale");
    expect(staleStroke.data.strokes).toEqual([]);

    const staleClear = await clearWhiteboard(base.revision);
    expect(staleClear.ok).toBe(false);
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
    expect((await getWhiteboard()).strokes.map((s) => s.id)).toEqual(["wall1"]);

    const clear = await POST(
      req("/api/display/whiteboard/", {
        method: "POST",
        headers,
        body: JSON.stringify({ op: "clear", revision: body.revision }),
      }),
    );
    expect(clear.status).toBe(200);
    expect((await getWhiteboard()).strokes).toEqual([]);
  });
});
