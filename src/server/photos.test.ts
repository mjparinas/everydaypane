import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as photoGET } from "@/app/api/display/photo/route";
import { GET as photosGET } from "@/app/api/display/photos/route";
import { GET as amazonGET, PUT as amazonPUT } from "@/app/api/household/amazon/route";
import { GET as checkGET } from "@/app/api/household/photos/route";
import type { PhotoData } from "@/lib/display/types";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { cookieFor, req, useTestServer } from "@/test/server";

import { clearMemoryCache } from "./cache";
import { loadConfig, saveConfig } from "./config";
import { addDevice } from "./devices";
import { imageType, parseShareUrl, peopleFilter, photoFromNode, photosFeed, resetPhotosForTests, timing, trimPeople } from "./photos";
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

describe("picture types", () => {
  it("reads the type from the bytes, and refuses HEIC and web pages", () => {
    expect(imageType(new Uint8Array([0xff, 0xd8, 0xff, 0xdb]), "binary/octet-stream")).toBe("image/jpeg");
    expect(imageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), "")).toBe("image/png");
    expect(imageType(new TextEncoder().encode("RIFF....WEBPVP8 "), "")).toBe("image/webp");
    expect(imageType(new TextEncoder().encode("\0\0\0\x18ftypheic"), "binary/octet-stream")).toBeNull();
    expect(imageType(new TextEncoder().encode("<html>"), "text/html")).toBeNull();
  });
});

describe("photo routes", () => {
  useTestServer();
  beforeEach(() => {
    timing.pause = () => Promise.resolve();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearMemoryCache();
    resetPhotosForTests();
  });

  async function withSources(sources: unknown[]) {
    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    const config = structuredClone(stored.config);
    (config.integrations.photos as { sources: unknown[] }).sources = sources;
    const saved = await saveConfig(LEGACY_ACCOUNT_ID, config, stored.version);
    expect(saved.ok).toBe(true);
    return (await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null)).token;
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
          return Promise.resolve(Response.json({ count: 4, data: [node("p1"), { id: "sub", kind: "FOLDER" }] }));
        if (url.includes("/nodes/root/children")) return Promise.resolve(Response.json({ count: 4, data: [node("p1"), node("p2")] }));
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

  it("serves Amazon photos sent as binary/octet-stream, and says why an album fails in the admin panel", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const HEIC = new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode("ftypheic")]);
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/shares/")) return Promise.resolve(Response.json({ nodeInfo: { id: "root" } }));
        if (url.includes("/children")) return Promise.resolve(Response.json({ count: 2, data: [node("p1"), node("p2")] }));
        const body = url.includes("/p1?") ? JPEG : HEIC;
        return Promise.resolve(new Response(body, { headers: { "content-type": "binary/octet-stream" } }));
      }),
    );
    const token = await withSources([{ id: "album", kind: "amazonShare", name: "Family", url: SHARE }]);
    const ok = await photoGET(req(`/api/display/photo/?s=album&i=p1&w=800&t=${token}`));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/jpeg");
    expect((await photoGET(req(`/api/display/photo/?s=album&i=p2&w=800&t=${token}`))).status).toBe(404);
    expect(errors.mock.calls.flat().join(" ")).toMatch(/wasn't a picture the screen can show/);

    const admin = await cookieFor("admin@example.com");
    expect(await (await checkGET(req("/api/household/photos/", { headers: { cookie: admin } }))).json()).toEqual({
      album: { count: 2, error: null, image: null },
    });
    const kid = await cookieFor("kid@example.com");
    expect((await checkGET(req("/api/household/photos/", { headers: { cookie: kid } }))).status).toBe(401);
  });

  it("lists and serves up to 5,000 photos from a large Amazon shared album", async () => {
    const count = 5_250;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = new URL(String(input));
        if (url.pathname.includes("/shares/")) return Promise.resolve(Response.json({ nodeInfo: { id: "root" } }));
        if (url.pathname.includes("/children")) {
          expect(url.searchParams.get("sort")).toBe('["name ASC","createdDate ASC"]');
          const offset = Number(url.searchParams.get("offset"));
          const limit = Number(url.searchParams.get("limit"));
          const data = Array.from({ length: Math.min(limit, count - offset) }, (_, i) => node(`p${offset + i}`));
          return Promise.resolve(Response.json({ count, data }));
        }
        return Promise.resolve(new Response("jpeg-bytes", { headers: { "content-type": "image/jpeg" } }));
      }),
    );
    const token = await withSources([{ id: "album", kind: "amazonShare", name: "Family", url: SHARE }]);
    const data = (await (await photosGET(req("/api/display/photos/", { headers: { "x-display-token": token } }))).json()) as PhotoData;
    expect(data.sources.album?.photos).toHaveLength(5_000);
    expect(data.sources.album?.photos.at(-1)?.[0]).toBe("p4999");
    expect((await photoGET(req(`/api/display/photo/?s=album&i=p4999&w=1280&t=${token}`))).status).toBe(200);
  });

  it.each(["upstream error", "deadline"])("preserves a complete album after an interrupted refresh (%s)", async (failure) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const now = Date.parse("2026-11-26T08:00:00Z");
    const refreshAt = now + 7 * 3_600_000;
    let clock = now;
    let interrupted = false;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.includes("/shares/")) return Response.json({ nodeInfo: { id: "root" } });
      if (url.searchParams.get("offset") === "0") {
        if (interrupted && failure === "deadline") clock += 45_000;
        return Response.json({ count: 2, data: [node("p1")] });
      }
      return interrupted ? new Response("temporary upstream error", { status: 502 }) : Response.json({ count: 2, data: [node("p2")] });
    });
    vi.stubGlobal("fetch", fetch);
    await withSources([{ id: "album", kind: "amazonShare", name: "Family", url: SHARE }]);
    const { config } = await loadConfig(LEGACY_ACCOUNT_ID);
    const ids = async (at: number) => (await photosFeed(LEGACY_ACCOUNT_ID, config, at)).sources.album?.photos.map((p) => p[0]);

    expect(await ids(now)).toEqual(["p1", "p2"]);
    interrupted = true;
    clock = refreshAt;
    expect(await ids(refreshAt)).toEqual(["p1", "p2"]);
    const calls = fetch.mock.calls.length;
    clearMemoryCache();
    expect(await ids(refreshAt + 60_000)).toEqual(["p1", "p2"]);
    expect(fetch).toHaveBeenCalledTimes(calls);

    interrupted = false;
    clock = refreshAt + 21 * 60_000;
    expect(await ids(clock)).toEqual(["p1", "p2"]);
    expect(fetch.mock.calls.length).toBeGreaterThan(calls);
  });

  it("waits and tries again when Amazon answers 503, and keeps the last good album while Amazon refuses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let busy = 1;
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        calls++;
        const url = String(input);
        if (busy > 0) {
          busy--;
          return Promise.resolve(new Response("<html>Sorry</html>", { status: 503, headers: { "content-type": "text/html" } }));
        }
        if (url.includes("/shares/")) return Promise.resolve(Response.json({ nodeInfo: { id: "root" } }));
        return Promise.resolve(Response.json({ count: 2, data: [node("p1"), node("p2")] }));
      }),
    );
    await withSources([{ id: "album", kind: "amazonShare", name: "Family", url: SHARE }]);
    const { config } = await loadConfig(LEGACY_ACCOUNT_ID);
    const t0 = Date.parse("2026-11-17T08:00:00Z");

    // One 503, then Amazon answers: the album lists.
    expect((await photosFeed(LEGACY_ACCOUNT_ID, config, t0)).sources.album?.photos.map((p) => p[0])).toEqual(["p1", "p2"]);

    // Seven hours later the list is due again, but Amazon refuses twice: the last good list is still shown...
    busy = 2;
    clearMemoryCache();
    expect((await photosFeed(LEGACY_ACCOUNT_ID, config, t0 + 7 * 3_600_000)).sources.album?.photos).toHaveLength(2);
    // ...and Amazon isn't asked again for a while.
    const before = calls;
    expect((await photosFeed(LEGACY_ACCOUNT_ID, config, t0 + 7 * 3_600_000 + 60_000)).sources.album?.photos).toHaveLength(2);
    expect(calls).toBe(before);
  });

  it("says Amazon is turning the server away when it keeps answering 503, and doesn't hammer it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetch = vi.fn(() =>
      Promise.resolve(new Response("<html>Sorry</html>", { status: 503, headers: { "content-type": "text/html" } })),
    );
    vi.stubGlobal("fetch", fetch);
    await withSources([{ id: "album", kind: "amazonShare", name: "Family", url: SHARE }]);
    const { config } = await loadConfig(LEGACY_ACCOUNT_ID);
    const t0 = Date.parse("2026-11-17T08:00:00Z");
    expect((await photosFeed(LEGACY_ACCOUNT_ID, config, t0)).sources.album?.error).toMatch(/turning our server away/);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((await photosFeed(LEGACY_ACCOUNT_ID, config, t0 + 5 * 60_000)).sources.album?.error).toMatch(/turning our server away/);
    expect(fetch).toHaveBeenCalledTimes(2);
    await photosFeed(LEGACY_ACCOUNT_ID, config, t0 + 25 * 60_000);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("explains when Amazon sends a web page instead of the album", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("<html>Sorry, robot</html>", { headers: { "content-type": "text/html" } }))),
    );
    const token = await withSources([{ id: "album", kind: "amazonShare", name: "Family", url: SHARE }]);
    const data = (await (await photosGET(req("/api/display/photos/", { headers: { "x-display-token": token } }))).json()) as PhotoData;
    expect(data.sources.album?.error).toMatch(/web page instead of the album/);
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
      req("/api/household/amazon/", { method: "PUT", headers: { cookie: admin }, body: JSON.stringify({ cookie: "hello" }) }),
    );
    expect(bad.status).toBe(422);
    const amazonCookie = "session-id=123-4567890-1234567; ubid-acbca=999; at-acbca=Atza|secret";
    const ok = await amazonPUT(
      req("/api/household/amazon/", {
        method: "PUT",
        headers: { cookie: admin },
        body: JSON.stringify({ cookie: amazonCookie, tld: "ca" }),
      }),
    );
    expect(ok.status).toBe(200);
    expect(await getSecret(LEGACY_ACCOUNT_ID, "amazon.cookie")).toBe(amazonCookie);
    const status = await amazonGET(req("/api/household/amazon/", { headers: { cookie: admin } }));
    const text = await status.text();
    expect(JSON.parse(text)).toMatchObject({ connected: true, people: [{ id: "personAAA111", name: "Mom" }] });
    expect(text).not.toContain("Atza");

    const kid = await cookieFor("kid@example.com");
    expect((await amazonGET(req("/api/household/amazon/", { headers: { cookie: kid } }))).status).toBe(401);
  });
});
