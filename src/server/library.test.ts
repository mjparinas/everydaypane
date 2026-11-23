import { afterEach, describe, expect, it, vi } from "vitest";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";

import { GET as googleGET, POST as googlePOST } from "@/app/api/admin/google-photos/route";
import { DELETE as libraryDELETE, GET as libraryGET, POST as libraryPOST } from "@/app/api/admin/library/route";
import { GET as photoGET } from "@/app/api/display/photo/route";
import { GET as photosGET } from "@/app/api/display/photos/route";
import type { PhotoData } from "@/lib/display/types";
import { cookieFor, req, useTestServer } from "@/test/server";

import { loadConfig, saveConfig } from "./config";
import { query } from "./db";
import { addDevice } from "./devices";
import { consentUrl, PHOTOS_SCOPE } from "./google";
import { fitted } from "./googlePhotos";
import { setSecret } from "./secrets";

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

describe("photo library", () => {
  useTestServer({ BLOB_READ_WRITE_TOKEN: "test-blob-token" });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    store.clear();
  });

  async function withLibrary(): Promise<string> {
    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    const config = structuredClone(stored.config);
    config.integrations.photos.sources = [{ id: "family", kind: "library", name: "Family" }];
    expect((await saveConfig(LEGACY_ACCOUNT_ID, config, stored.version)).ok).toBe(true);
    return (await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null)).token;
  }

  it("takes uploads from an admin, keeps them private, and shows them on displays", async () => {
    const token = await withLibrary();
    const admin = await cookieFor("admin@example.com");
    const upload = (bytes: Uint8Array<ArrayBuffer>, cookie = admin, w = "2048", h = "1536") =>
      libraryPOST(
        req("/api/admin/library/?source=family", {
          method: "POST",
          headers: { cookie, "content-type": "image/jpeg", "x-photo-width": w, "x-photo-height": h },
          body: bytes,
        }),
      );
    expect((await upload(JPEG)).status).toBe(200);
    expect((await upload(new TextEncoder().encode("<html>"))).status).toBe(400);
    expect((await upload(JPEG, admin, "5000", "100")).status).toBe(400);
    expect((await upload(JPEG, await cookieFor("kid@example.com"))).status).toBe(401);
    expect([...store.keys()]).toHaveLength(1);

    const list = (await (await libraryGET(req("/api/admin/library/?source=family", { headers: { cookie: admin } }))).json()) as {
      photos: { id: string; w: number }[];
    };
    expect(list.photos).toHaveLength(1);
    const id = list.photos[0]?.id ?? "";

    const feed = (await (await photosGET(req("/api/display/photos/", { headers: { "x-display-token": token } }))).json()) as PhotoData;
    expect(feed.sources.family?.photos).toEqual([[id, 2048, 1536, ""]]);
    const img = await photoGET(req(`/api/display/photo/?s=family&i=${id}&w=800&t=${token}`));
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(JPEG);
    // The Blob store's own address never reaches a display.
    expect(JSON.stringify(feed)).not.toContain("blob.vercel-storage");

    expect(
      (await libraryDELETE(req(`/api/admin/library/?source=family&photo=${id}`, { method: "DELETE", headers: { cookie: admin } }))).status,
    ).toBe(200);
    expect(store.size).toBe(0);
    expect((await photoGET(req(`/api/display/photo/?s=family&i=${id}&t=${token}`))).status).toBe(404);
  });

  it("deletes a library album's photos only when the source is removed by a successful Save", async () => {
    await withLibrary();
    const admin = await cookieFor("admin@example.com");
    expect(
      (
        await libraryPOST(
          req("/api/admin/library/?source=family", {
            method: "POST",
            headers: { cookie: admin, "content-type": "image/jpeg", "x-photo-width": "800", "x-photo-height": "600" },
            body: JPEG,
          }),
        )
      ).status,
    ).toBe(200);
    expect(store.size).toBe(1);

    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    const without = structuredClone(stored.config);
    without.integrations.photos.sources = [];
    expect((await saveConfig(LEGACY_ACCOUNT_ID, without, stored.version)).ok).toBe(true);
    expect(store.size).toBe(0);
  });

  it("copies photos picked in Google Photos, skipping videos and ones already added", async () => {
    await withLibrary();
    const admin = await cookieFor("admin@example.com");
    expect(await (await googleGET(req("/api/admin/google-photos/", { headers: { cookie: admin } }))).json()).toMatchObject({
      allowed: false,
    });
    const start = () =>
      googlePOST(req("/api/admin/google-photos/", { method: "POST", headers: { cookie: admin }, body: JSON.stringify({ start: true }) }));
    expect(((await (await start()).json()) as { connect?: boolean }).connect).toBe(true);

    await setSecret(LEGACY_ACCOUNT_ID, "google.refreshToken", "refresh");
    await setSecret(LEGACY_ACCOUNT_ID, "google.scopes", `https://www.googleapis.com/auth/calendar.readonly ${PHOTOS_SCOPE}`);
    const downloads: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("https://oauth2.googleapis.com/token"))
          return Promise.resolve(Response.json({ access_token: "at", expires_in: 3600 }));
        if (url === "https://photospicker.googleapis.com/v1/sessions" && init?.method === "POST")
          return Promise.resolve(
            Response.json({
              id: "s1",
              pickerUri: "https://photos.google.com/picker/s1",
              pollingConfig: { pollInterval: "3s" },
              mediaItemsSet: false,
            }),
          );
        if (url.startsWith("https://photospicker.googleapis.com/v1/mediaItems"))
          return Promise.resolve(
            Response.json({
              mediaItems: [
                {
                  id: "g1",
                  createTime: "2026-07-01T18:00:00Z",
                  type: "PHOTO",
                  mediaFile: {
                    baseUrl: "https://lh3.googleusercontent.com/p/g1",
                    mimeType: "image/heic",
                    mediaFileMetadata: { width: 4032, height: 3024 },
                  },
                },
                { id: "v1", type: "VIDEO", mediaFile: { baseUrl: "https://lh3.googleusercontent.com/p/v1" } },
              ],
            }),
          );
        if (url.startsWith("https://lh3.googleusercontent.com/p/g1")) {
          downloads.push(url);
          expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer at");
          return Promise.resolve(new Response(JPEG, { headers: { "content-type": "image/jpeg" } }));
        }
        return Promise.resolve(new Response("unexpected", { status: 500 }));
      }),
    );
    const s = (await (await start()).json()) as { session: string; pickerUri: string; pollMs: number };
    expect(s).toEqual({ session: "s1", pickerUri: "https://photos.google.com/picker/s1/autoclose", pollMs: 3000 });

    const copy = async () =>
      (await (
        await googlePOST(
          req("/api/admin/google-photos/", {
            method: "POST",
            headers: { cookie: admin },
            body: JSON.stringify({ source: "family", session: "s1", page: null }),
          }),
        )
      ).json()) as { added: number; skipped: number; next: string | null };
    expect(await copy()).toEqual({ added: 1, skipped: 1, next: null });
    expect(downloads).toEqual(["https://lh3.googleusercontent.com/p/g1=w2048-h2048"]);
    expect(await copy()).toEqual({ added: 0, skipped: 2, next: null });

    const list = (await (await libraryGET(req("/api/admin/library/?source=family", { headers: { cookie: admin } }))).json()) as {
      photos: { w: number; h: number; taken: string; origin: string }[];
    };
    expect(list.photos).toEqual([expect.objectContaining({ w: 2048, h: 1536, taken: "2026-07-01", origin: "google" })]);
  });

  it("deletes a library album's photos when that album is saved away", async () => {
    await withLibrary();
    const admin = await cookieFor("admin@example.com");
    expect(
      (
        await libraryPOST(
          req("/api/admin/library/?source=family", {
            method: "POST",
            headers: { cookie: admin, "content-type": "image/jpeg", "x-photo-width": "800", "x-photo-height": "600" },
            body: JPEG,
          }),
        )
      ).status,
    ).toBe(200);
    expect(store.size).toBe(1);
    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    const config = structuredClone(stored.config);
    config.integrations.photos.sources = [];
    expect((await saveConfig(LEGACY_ACCOUNT_ID, config, stored.version)).ok).toBe(true);
    expect(store.size).toBe(0);
    const left = await query<{ n: number }>("SELECT COUNT(*) AS n FROM photos");
    expect(Number(left[0]?.n)).toBe(0);
  });

  it("asks Google for Photos only when connecting Google Photos", () => {
    expect(consentUrl("s", "https://x/cb")).not.toContain("photospicker");
    expect(decodeURIComponent(consentUrl("s", "https://x/cb", true))).toContain(PHOTOS_SCOPE);
    expect(fitted(4032, 3024)).toEqual({ w: 2048, h: 1536 });
    expect(fitted(800, 600)).toEqual({ w: 800, h: 600 });
  });
});
