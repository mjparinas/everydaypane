import { describe, expect, it } from "vitest";

import { GET as displayGET } from "@/app/api/display/messages/route";
import { DELETE, PATCH } from "@/app/api/messages/[id]/route";
import { GET, POST } from "@/app/api/messages/route";
import { cookieFor, req, useTestServer } from "@/test/server";

import { query } from "./db";
import { addDevice } from "./devices";
import { boardTag, listMessages, postMessage } from "./messages";

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
    expect((await listMessages())[0]?.pinned).toBe(true);
    expect((await DELETE(req("/", { method: "DELETE", headers: { cookie: admin } }), ctx(message.id))).status).toBe(200);
    expect(await listMessages()).toEqual([]);
  });

  it("puts pinned notes first, then the newest, and drops expired ones", async () => {
    const t = 1_800_000_000_000;
    const base = { colour: "blue" as const, postedBy: "kid@example.com" };
    await postMessage({ ...base, author: "A", text: "old", expiresInHours: null }, t);
    await postMessage({ ...base, author: "B", text: "short-lived", expiresInHours: 1 }, t + 1000);
    await postMessage({ ...base, author: "C", text: "new", expiresInHours: null }, t + 2000);
    const [old] = await query<{ id: string }>("SELECT id FROM messages WHERE text = 'old'");
    await query("UPDATE messages SET pinned = 1 WHERE id = ?", [old!.id]);
    expect((await listMessages(50, t + 3000)).map((m) => m.text)).toEqual(["old", "new", "short-lived"]);
    expect((await listMessages(50, t + 2 * 3_600_000)).map((m) => m.text)).toEqual(["old", "new"]);
  });

  it("gives displays the board with an ETag, and 304 when nothing changed", async () => {
    await postMessage({ author: "Dad", text: "Pizza night", colour: "pink", expiresInHours: null, postedBy: "admin@example.com" });
    const { token } = await addDevice("Kitchen", null);
    const first = await displayGET(req("/api/display/messages/", { headers: { "x-display-token": token } }));
    const body = (await first.json()) as { messages: { text: string }[] };
    expect(body.messages.map((m) => m.text)).toEqual(["Pizza night"]);
    expect(JSON.stringify(body)).not.toContain("postedBy");
    const tag = first.headers.get("etag")!;
    expect(tag).toBe(boardTag(await listMessages(20)));
    const again = await displayGET(req("/api/display/messages/", { headers: { "x-display-token": token, "if-none-match": tag } }));
    expect(again.status).toBe(304);
    expect((await displayGET(req("/api/display/messages/"))).status).toBe(401);
  });
});
