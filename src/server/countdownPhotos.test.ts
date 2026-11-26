import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as photoGET } from "@/app/api/display/countdown-photo/route";
import { POST as uploadPOST } from "@/app/api/household/countdown-photo/route";
import type { DashboardConfig } from "@/lib/config/schema";
import { newWidget } from "@/lib/config/widgets";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { cookieFor, req, useTestServer } from "@/test/server";

import { loadConfig, saveConfig } from "./config";
import { addDevice } from "./devices";

// The private Blob store, kept in memory.
const store = vi.hoisted(() => new Map<string, { bytes: Uint8Array<ArrayBuffer>; type: string }>());
vi.mock("@vercel/blob", () => ({
  put: vi.fn((pathname: string, body: Buffer, opts: { access: string; contentType: string }) => {
    if (opts.access !== "private") throw new Error("photos must be private");
    store.set(pathname, { bytes: Uint8Array.from(body), type: opts.contentType });
    return Promise.resolve({ pathname, url: `https://store.private.blob.vercel-storage.com/${pathname}` });
  }),
  get: vi.fn((pathname: string) => {
    const hit = store.get(pathname);
    return Promise.resolve(hit ? { statusCode: 200, stream: new Response(hit.bytes).body, blob: { contentType: hit.type } } : null);
  }),
  del: vi.fn((paths: string[]) => {
    for (const p of paths) store.delete(p);
    return Promise.resolve();
  }),
}));

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]);
const DAY = 24 * 3600_000;

describe("countdown photos", () => {
  useTestServer({ BLOB_READ_WRITE_TOKEN: "test-blob-token" });
  afterEach(() => store.clear());

  const upload = async (cookie: string, w = "800", h = "600") =>
    uploadPOST(
      req("/api/household/countdown-photo/", {
        method: "POST",
        headers: { cookie, "content-type": "image/jpeg", "x-photo-width": w, "x-photo-height": h },
        body: JPEG,
      }),
    );

  async function saveWith(photo: string | undefined, now = Date.now()) {
    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    const config: DashboardConfig = structuredClone(stored.config);
    const widget = {
      ...newWidget("countdown", "cd-photos", { x: 0, y: 0 }),
      events: [
        { id: "sam", name: "Sam", date: "2015-03-02", emoji: "", kind: "birthday" as const, yearly: true, ...(photo ? { photo } : {}) },
      ],
    };
    const view = config.views[0]!;
    view.widgets = [...view.widgets.filter((w) => w.id !== "cd-photos" && w.type !== "photos"), widget];
    const saved = await saveConfig(LEGACY_ACCOUNT_ID, config, stored.version, now);
    expect(saved.ok).toBe(true);
  }

  it("shows a photo on the wall only while a saved countdown date names it, and tidies it away after", async () => {
    const admin = await cookieFor("admin@example.com");
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    expect((await upload(await cookieFor("kid@example.com"))).status).toBe(401);
    expect((await upload(admin, "2048", "1536")).status).toBe(400);
    const r = await upload(admin);
    expect(r.status).toBe(200);
    const { id } = (await r.json()) as { id: string };

    const wall = () => photoGET(req(`/api/display/countdown-photo/?i=${id}`, { headers: { "x-display-token": token } }));
    // Not yet published: the admin's preview shows it, the wall doesn't.
    expect((await wall()).status).toBe(404);
    expect((await photoGET(req(`/api/display/countdown-photo/?i=${id}`, { headers: { cookie: admin } }))).status).toBe(200);

    await saveWith(id);
    const img = await wall();
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(JPEG);

    // Removed from the date: kept for a day (it may be about to be published from another tab), then deleted.
    await saveWith(undefined);
    expect(store.size).toBe(1);
    expect((await wall()).status).toBe(404);
    await saveWith(undefined, Date.now() + 2 * DAY);
    expect(store.size).toBe(0);
  });

  it("never serves another source's photos or a malformed id", async () => {
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    for (const i of ["", "../x", "a".repeat(80)]) {
      expect(
        (await photoGET(req(`/api/display/countdown-photo/?i=${encodeURIComponent(i)}`, { headers: { "x-display-token": token } }))).status,
      ).toBe(404);
    }
  });
});
