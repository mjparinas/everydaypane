import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchPublicHttps, isPrivateHost, isPrivateIp, publicHttpsUrl } from "./publicUrl";

const lookup = vi.hoisted(() =>
  vi.fn(async (hostname: string) => {
    if (hostname === "rebind.test") return [{ address: "10.1.2.3", family: 4 }];
    return [{ address: "1.1.1.1", family: 4 }];
  }),
);
vi.mock("node:dns/promises", () => ({ lookup }));

describe("publicHttpsUrl", () => {
  it("allows ordinary public https addresses", () => {
    expect(publicHttpsUrl("https://www.sd35.bc.ca/status")).toBe("https://www.sd35.bc.ca/status");
    expect(publicHttpsUrl(" https://i.scdn.co/image/abc ")).toBe("https://i.scdn.co/image/abc");
  });

  it("blocks private, local and non-https addresses", () => {
    expect(publicHttpsUrl("http://example.com/a")).toBeNull();
    expect(publicHttpsUrl("https://localhost/a")).toBeNull();
    expect(publicHttpsUrl("https://printer.local/a")).toBeNull();
    expect(publicHttpsUrl("https://192.168.1.20/a")).toBeNull();
    expect(publicHttpsUrl("https://10.0.0.5/a")).toBeNull();
    expect(publicHttpsUrl("https://127.0.0.1/a")).toBeNull();
    expect(publicHttpsUrl("https://[::1]/a")).toBeNull();
    expect(publicHttpsUrl("https://user:pass@example.com/a")).toBeNull();
    expect(isPrivateHost("169.254.169.254")).toBe(true);
    expect(isPrivateHost("172.16.5.1")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateHost("www.sd35.bc.ca")).toBe(false);
  });
});

describe("fetchPublicHttps", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("follows a public redirect and refuses a private hop or a private address", async () => {
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      const url = String(input);
      if (url === "https://ok.example/a") return new Response(null, { status: 302, headers: { location: "https://cdn.example/b" } });
      if (url === "https://cdn.example/b") return new Response("body", { status: 200 });
      if (url === "https://bad.example/a") return new Response(null, { status: 302, headers: { location: "https://127.0.0.1/secret" } });
      return new Response("nope", { status: 200 });
    });
    vi.stubGlobal("fetch", fetch);

    const ok = await fetchPublicHttps("https://ok.example/a");
    expect(await ok.text()).toBe("body");
    expect(fetch).toHaveBeenCalledTimes(2);

    await expect(fetchPublicHttps("https://bad.example/a")).rejects.toThrow(/public https/i);
    await expect(fetchPublicHttps("https://rebind.test/x")).rejects.toThrow(/public https/i);
    expect(fetch.mock.calls.some((c) => String(c[0]) === "https://rebind.test/x")).toBe(false);
    await expect(fetchPublicHttps("http://ok.example/a")).rejects.toThrow(/public https/i);
  });
});
