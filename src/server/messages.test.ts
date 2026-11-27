import { describe, expect, it } from "vitest";

import { GET as displayGET, POST as displayPOST } from "@/app/api/display/messages/route";
import { DELETE, PATCH } from "@/app/api/messages/[id]/route";
import { GET, POST } from "@/app/api/messages/route";
import { defaultConfig } from "@/lib/config/defaults";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { cookieFor, req, useTestServer } from "@/test/server";

import { loadConfig, saveConfig } from "./config";
import { query } from "./db";
import { addDevice } from "./devices";
import { boardTag, listMessages, pinMessage, postMessage, postMessageFromWall } from "./messages";

const note = { author: "Mom", text: "Soccer moved to 5", colour: "yellow", expiresInHours: 24 };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("message board", () => {
  useTestServer();

  it("lets family post and read notes, without showing anyone's email", async () => {
    const kid = await cookieFor("kid@example.com");
    const posted = await POST(req("/api/messages/", { method: "POST", body: JSON.stringify(note), headers: { cookie: kid } }));
    expect(posted.status).toBe(201);
    const r = await GET(req("/api/messages/", { headers: { cookie: kid } }));
    const body = (await r.json()) as { messages: { text: string; mine: boolean }[]; admin: boolean };
    expect(body.messages.map((m) => [m.text, m.mine])).toEqual([["Soccer moved to 5", true]]);
    expect(body.admin).toBe(false);
    expect(JSON.stringify(body)).not.toContain("@example.com");
  });

  it("refuses people who aren't signed in, and empty notes", async () => {
    expect((await POST(req("/api/messages/", { method: "POST", body: JSON.stringify(note) }))).status).toBe(401);
    const kid = await cookieFor("kid@example.com");
    const empty = await POST(
      req("/api/messages/", { method: "POST", body: JSON.stringify({ ...note, text: "  " }), headers: { cookie: kid } }),
    );
    expect(empty.status).toBe(400);
  });

  it("lets people delete only their own notes, and admins delete or pin any", async () => {
    const kid = await cookieFor("kid@example.com");
    const admin = await cookieFor("admin@example.com");
    const r = await POST(req("/api/messages/", { method: "POST", body: JSON.stringify(note), headers: { cookie: admin } }));
    const { message } = (await r.json()) as { message: { id: string } };
    expect((await DELETE(req("/", { method: "DELETE", headers: { cookie: kid } }), ctx(message.id))).status).toBe(403);
    expect((await PATCH(req("/", { method: "PATCH", body: '{"pinned":true}', headers: { cookie: kid } }), ctx(message.id))).status).toBe(
      403,
    );
    expect((await PATCH(req("/", { method: "PATCH", body: '{"pinned":true}', headers: { cookie: admin } }), ctx(message.id))).status).toBe(
      200,
    );
    expect((await listMessages(LEGACY_ACCOUNT_ID))[0]?.pinned).toBe(true);
    expect((await DELETE(req("/", { method: "DELETE", headers: { cookie: admin } }), ctx(message.id))).status).toBe(200);
    expect(await listMessages(LEGACY_ACCOUNT_ID)).toEqual([]);
  });

  it("lets any signed-in person delete a legacy note with no posted_by", async () => {
    const kid = await cookieFor("kid@example.com");
    await postMessage(LEGACY_ACCOUNT_ID, {
      author: "Mom",
      text: "Old note",
      colour: "yellow",
      expiresInHours: null,
      postedBy: "admin@example.com",
    });
    const [row] = await query<{ id: string }>("SELECT id FROM messages WHERE text = 'Old note'");
    await query("UPDATE messages SET posted_by = NULL WHERE id = ?", [row!.id]);
    expect((await DELETE(req("/", { method: "DELETE", headers: { cookie: kid } }), ctx(row!.id))).status).toBe(200);
    expect(await listMessages(LEGACY_ACCOUNT_ID)).toEqual([]);
  });

  it("puts pinned notes first, then the newest, and drops expired ones", async () => {
    const t = 1_800_000_000_000;
    const base = { colour: "blue" as const, postedBy: "kid@example.com" };
    await postMessage(LEGACY_ACCOUNT_ID, { ...base, author: "A", text: "old", expiresInHours: null }, t);
    await postMessage(LEGACY_ACCOUNT_ID, { ...base, author: "B", text: "short-lived", expiresInHours: 1 }, t + 1000);
    await postMessage(LEGACY_ACCOUNT_ID, { ...base, author: "C", text: "new", expiresInHours: null }, t + 2000);
    const [old] = await query<{ id: string }>("SELECT id FROM messages WHERE text = 'old'");
    await query("UPDATE messages SET pinned = 1 WHERE id = ?", [old!.id]);
    expect((await listMessages(LEGACY_ACCOUNT_ID, 50, t + 3000)).map((m) => m.text)).toEqual(["old", "new", "short-lived"]);
    expect((await listMessages(LEGACY_ACCOUNT_ID, 50, t + 2 * 3_600_000)).map((m) => m.text)).toEqual(["old", "new"]);
  });

  it("gives displays the board with an ETag, and 304 when nothing changed", async () => {
    await postMessage(LEGACY_ACCOUNT_ID, {
      author: "Dad",
      text: "Pizza night",
      colour: "pink",
      expiresInHours: null,
      postedBy: "admin@example.com",
    });
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const first = await displayGET(req("/api/display/messages/", { headers: { "x-display-token": token } }));
    const body = (await first.json()) as { messages: { text: string }[] };
    expect(body.messages.map((m) => m.text)).toEqual(["Pizza night"]);
    expect(JSON.stringify(body)).not.toContain("postedBy");
    const tag = first.headers.get("etag")!;
    expect(tag).toBe(boardTag(await listMessages(LEGACY_ACCOUNT_ID, 20)));
    const again = await displayGET(req("/api/display/messages/", { headers: { "x-display-token": token, "if-none-match": tag } }));
    expect(again.status).toBe(304);
    expect((await displayGET(req("/api/display/messages/"))).status).toBe(401);
  });

  it("delivers new notes to the wall even when older pins fill the feed", async () => {
    const startedAt = Date.now();
    const post = (text: string, addedAt: number) =>
      postMessage(LEGACY_ACCOUNT_ID, { ...note, text, colour: "yellow", postedBy: "kid@example.com" }, addedAt);
    for (let i = 0; i < 20; i++) {
      const pinned = await post(`Pinned ${i}`, startedAt + i);
      await pinMessage(LEGACY_ACCOUNT_ID, pinned.id, true);
    }
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const headers = { "x-display-token": token };
    const first = await displayGET(req("/api/display/messages/", { headers }));
    const fresh = await post("New pickup plan", startedAt + 20);
    const updated = await displayGET(
      req("/api/display/messages/", { headers: { ...headers, "if-none-match": first.headers.get("etag")! } }),
    );
    expect(updated.status).toBe(200);
    const { messages } = (await updated.json()) as { messages: { id: string; pinned: boolean }[] };
    expect(messages.filter((m) => m.pinned)).toHaveLength(20);
    expect(messages.at(-1)).toMatchObject({ id: fresh.id, pinned: false });
  });

  it("posts from the wall when a messages widget allows it", async () => {
    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    const config = defaultConfig();
    config.views[0]?.widgets.push({
      id: "msg",
      type: "messages",
      x: 0,
      y: 0,
      w: 2,
      h: 2,
      showBackground: true,
      count: 5,
      allowAdd: true,
    });
    expect((await saveConfig(LEGACY_ACCOUNT_ID, config, stored.version)).ok).toBe(true);
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const headers = { "x-display-token": token };
    const r = await displayPOST(
      req("/api/display/messages/", {
        method: "POST",
        headers,
        body: JSON.stringify({ author: "Kid", text: "Homework done", colour: "green" }),
      }),
    );
    expect(r.status).toBe(201);
    expect(
      (await postMessageFromWall(LEGACY_ACCOUNT_ID, config, { author: "X", text: "Y", colour: "blue", postedBy: "wall" })) === "forbidden",
    ).toBe(false);
    const off = defaultConfig();
    expect(await postMessageFromWall(LEGACY_ACCOUNT_ID, off, { author: "X", text: "Y", colour: "blue", postedBy: "wall" })).toBe(
      "forbidden",
    );
  });
});
