import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/admin/places/route";
import { cookieFor, req, useTestServer } from "@/test/server";

import { trimPlaces } from "./places";

// Open-Meteo's geocoding answer, as it came back for "Langley" on 2026-11-21 (trimmed to the fields used).
const answer = {
  results: [
    { id: 6049429, name: "Langley", latitude: 49.10107, longitude: -122.65883, country: "Canada", admin1: "British Columbia" },
    { id: 4584633, name: "Langley", latitude: 33.51791, longitude: -81.844, country: "United States", admin1: "South Carolina" },
    { id: 5800475, name: "Langley", latitude: 48.04009, longitude: -122.40626, country: "United States", admin1: "Washington" },
    { id: 1, name: "Langley", latitude: 49.1, longitude: -122.6, country: "Canada", admin1: "British Columbia" },
  ],
  generationtime_ms: 0.27,
};

describe("trimPlaces", () => {
  it("labels each place with its province or state and country, once each", () => {
    expect(trimPlaces(answer)).toEqual([
      { label: "Langley, British Columbia, Canada", latitude: 49.10107, longitude: -122.65883 },
      { label: "Langley, South Carolina, United States", latitude: 33.51791, longitude: -81.844 },
      { label: "Langley, Washington, United States", latitude: 48.04009, longitude: -122.40626 },
    ]);
  });

  it("answers nothing when nothing matched (Open-Meteo leaves results out)", () => {
    expect(trimPlaces({ generationtime_ms: 0.1 })).toEqual([]);
  });

  it("copes with a place that has no province", () => {
    expect(trimPlaces({ results: [{ name: "Monaco", latitude: 43.73, longitude: 7.42, country: "Monaco" }] })).toEqual([
      { label: "Monaco, Monaco", latitude: 43.73, longitude: 7.42 },
    ]);
  });
});

describe("/api/admin/places/", () => {
  useTestServer();
  afterEach(() => vi.unstubAllGlobals());

  it("looks up places for admins only, by name", async () => {
    const fetch = vi.fn<(input: string | URL | Request) => Promise<Response>>(() => Promise.resolve(Response.json(answer)));
    vi.stubGlobal("fetch", fetch);
    const url = "/api/admin/places/?q=Langley";
    const kid = await cookieFor("kid@example.com");
    expect((await GET(req(url, { headers: { cookie: kid } }))).status).toBe(401);
    const admin = await cookieFor("admin@example.com");
    const r = await GET(req(url, { headers: { cookie: admin } }));
    expect(((await r.json()) as { matches: unknown[] }).matches).toHaveLength(3);
    const asked = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(asked.host).toBe("geocoding-api.open-meteo.com");
    expect(asked.searchParams.get("name")).toBe("Langley");
    expect((await GET(req("/api/admin/places/?q=x", { headers: { cookie: admin } }))).status).toBe(400);
  });

  it("says so when the search doesn't answer", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("busy", { status: 503 })));
    const admin = await cookieFor("admin@example.com");
    expect((await GET(req("/api/admin/places/?q=Langley", { headers: { cookie: admin } }))).status).toBe(502);
  });
});
