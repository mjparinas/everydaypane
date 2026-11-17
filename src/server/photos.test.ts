import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as amazonGET, PUT as amazonPUT } from "@/app/api/admin/amazon/route";
import { GET as photoGET } from "@/app/api/display/photo/route";
import { GET as photosGET } from "@/app/api/display/photos/route";
import type { PhotoData } from "@/lib/display/types";
import { cookieFor, req, useTestServer } from "@/test/server";

import { clearMemoryCache } from "./cache";
import { loadConfig, saveConfig } from "./config";
import { addDevice } from "./devices";
import { parseShareUrl, peopleFilter, photoFromNode, trimPeople } from "./photos";
import { getSecret } from "./secrets";

const SHARE = "https://www.amazon.ca/photos/share/AbCdEfGhIjKlMnOp1234";
const node = (id: string, extra: object = {}) => ({
  id,
  kind: "FILE",
  status: "AVAILABLE",
  tempLink: `https://content-na.drive.amazonaws.com/v2/download/presigned/${id}`,
  contentProperties: { contentType: "image/jpeg", image: { width: 4032, height: 3024, dateTimeOriginal: "2026-07-01T10:00:00.000Z" } },
  ...extra,
});

describe("photo sources", () => {
  it("reads Amazon share links, and refuses other addresses", () => {
    expect(parseShareUrl(SHARE)).toEqual({ origin: "https://www.amazon.ca", shareId: "AbCdEfGhIjKlMnOp1234" });
    expect(parseShareUrl("https://amazon.com/clouddrive/share/AbCdEfGhIjKlMnOp1234?ref=x")?.origin).toBe("https://www.amazon.com");
    expect(parseShareUrl("https://evil.example/photos/share/AbCdEfGhIjKlMnOp1234")).toBeNull();
    expect(parseShareUrl("not a url")).toBeNull();
  });

  it("keeps photos, turns rotated ones, and skips videos and trashed files", () => {
    expect(photoFromNode(node("a"))).toEqual({
      id: "a",
      url: "https://content-na.drive.amazonaws.com/v2/download/presigned/a",
      w: 4032,
      h: 3024,
      taken: "2026-07-01",
    });
    const rotated = node("b", { contentProperties: { contentType: "image/jpeg", image: { width: 4032, height: 3024, orientation: "6" } } });
    expect(photoFromNode(rotated)).toMatchObject({ w: 3024, h: 4032 });
    expect(photoFromNode(node("c", { contentProperties: { contentType: "video/mp4", video: {} } }))).toBeNull();
    expect(photoFromNode(node("d", { status: "TRASH" }))).toBeNull();
  });

  it("builds Amazon's people filter without letting anything else into it", () => {
    expect(peopleFilter(["abc123", "x) OR (type:VIDEOS"])).toBe("type:(PHOTOS) AND people:(abc123 OR xORtypeVIDEOS)");
  });

  it("finds people in Amazon's aggregation answer", () => {
    const raw = {
      aggregations: {
        allPeople: [
          { value: "personAAA111", label: "Mom", count: 320 },
          { value: "personBBB222", count: 12 },
        ],
      },
    };
    expect(trimPeople(raw)).toEqual([
      { id: "personAAA111", name: "Mom", count: 320 },
      { id: "personBBB222", name: "Unnamed person", count: 12 },
    ]);
  });
});

describe("photo routes", () => {
  useTestServer();
  afterEach(() => {
    vi.unstubAllGlobals();
    clearMemoryCache();
  });

  async function withSources(sources: unknown[]) {
    const stored = await loadConfig();
    const config = structuredClone(stored.config);
    (config.integrations.photos as { sources: unknown[] }).sources = sources;
    const saved = await saveConfig(config, stored.version);
    expect(saved.ok).toBe(true);
    return (await addDevice("Kitchen", null)).token;
  }

  it("lists a shared album with its sub-folders and pages, and serves its photos at display size", async () => {
    let expired = false;
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = String(input);
        seen.push(url);
        if (url.startsWith("https://www.amazon.ca/drive/v1/shares/AbCdEfGhIjKlMnOp1234"))
          return Promise.resolve(Response.json({ nodeInfo: { id: "root" } }));
        if (url.includes("/nodes/root/children") && url.includes("offset=0"))
          return Promise.resolve(Response.json({ count: 3, data: [node("p1"), { id: "sub", kind: "FOLDER" }] }));
        if (url.includes("/nodes/root/children")) return Promise.resolve(Response.json({ count: 3, data: [node("p2")] }));
        if (url.includes("/nodes/sub/children")) return Promise.resolve(Response.json({ count: 1, data: [node("p3")] }));
        if (url.startsWith("https://content-na.drive.amazonaws.com/")) {
          if (expired) return Promise.resolve(new Response("gone", { status: 410 }));
          return Promise.resolve(new Response("jpeg-bytes", { headers: { "content-type": "image/jpeg" } }));
        }
        return Promise.resolve(new Response("unexpected", { status: 500 }));
      }),
    );
    const token = await withSources([{ id: "album", kind: "amazonShare", name: "Family", url: SHARE }]);
    const data = (await (await photosGET(req("/api/display/photos/", { headers: { "x-display-token": token } }))).json()) as PhotoData;
    expect(data.sources.album?.photos.map((p) => p[0])).toEqual(["p1", "p2", "p3"]);
    expect(data.sources.album?.photos[0]).toEqual(["p1", 4032, 3024, "2026-07-01"]);
    expect(JSON.stringify(data)).not.toContain("amazonaws");

    const img = await photoGET(req(`/api/display/photo/?s=album&i=p2&w=1280&t=${token}`));
    expect(img.status).toBe(200);
    expect(await img.text()).toBe("jpeg-bytes");
    expect(seen.some((u) => u.endsWith("/presigned/p2?viewBox=1280,1280"))).toBe(true);

    // An id the server didn't list, or a source that doesn't exist, is refused without fetching anything.
    const before = seen.length;
    expect((await photoGET(req(`/api/display/photo/?s=album&i=https://evil.example/x.jpg&t=${token}`))).status).toBe(404);
    expect((await photoGET(req(`/api/display/photo/?s=nope&i=p1&t=${token}`))).status).toBe(404);
    expect(seen.length).toBe(before);

    // A temporary link that has expired is listed again; still gone, so the display gets a 404 and moves on.
    expired = true;
    expect((await photoGET(req(`/api/display/photo/?s=album&i=p1&t=${token}`))).status).toBe(404);
  });

  it("reports a source that fails without hiding the others", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("nope", { status: 403 }))),
    );
    const token = await withSources([
      { id: "album", kind: "amazonShare", name: "Family", url: SHARE },
      { id: "list", kind: "urls", name: "Art", urls: ["https://example.com/a.jpg", "https://example.com/b.jpg"] },
    ]);
    const data = (await (await photosGET(req("/api/display/photos/", { headers: { "x-display-token": token } }))).json()) as PhotoData;
    expect(data.sources.album?.error).toMatch(/isn't shared with a link/);
    expect(data.sources.list?.photos.map((p) => p[0])).toEqual(["u0", "u1"]);
  });

  it("stores the Amazon sign-in encrypted and never sends it back", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json({ aggregations: { allPeople: [{ value: "personAAA111", label: "Mom" }] } }))),
    );
    const admin = await cookieFor("admin@example.com");
    const bad = await amazonPUT(
      req("/api/admin/amazon/", { method: "PUT", headers: { cookie: admin }, body: JSON.stringify({ cookie: "hello" }) }),
    );
    expect(bad.status).toBe(422);
    const amazonCookie = "session-id=123-4567890-1234567; ubid-acbca=999; at-acbca=Atza|secret";
    const ok = await amazonPUT(
      req("/api/admin/amazon/", { method: "PUT", headers: { cookie: admin }, body: JSON.stringify({ cookie: amazonCookie, tld: "ca" }) }),
    );
    expect(ok.status).toBe(200);
    expect(await getSecret("amazon.cookie")).toBe(amazonCookie);
    const status = await amazonGET(req("/api/admin/amazon/", { headers: { cookie: admin } }));
    const text = await status.text();
    expect(JSON.parse(text)).toMatchObject({ connected: true, people: [{ id: "personAAA111", name: "Mom" }] });
    expect(text).not.toContain("Atza");

    const kid = await cookieFor("kid@example.com");
    expect((await amazonGET(req("/api/admin/amazon/", { headers: { cookie: kid } }))).status).toBe(401);
  });
});
