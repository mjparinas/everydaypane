import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as displayGET } from "@/app/api/display/blueriiot/route";
import { GET as adminGET, PUT as adminPUT } from "@/app/api/household/blueriiot/route";
import { poolLevel, poolRange } from "@/lib/blueRiiot";
import { defaultConfig } from "@/lib/config/defaults";
import type { PoolData } from "@/lib/display/types";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { cookieFor, req, useTestServer } from "@/test/server";

import { blueRiiotFeed, poolAlerts, signV4, trimDevices, trimMeasurements, trimPools } from "./blueRiiot";
import { clearMemoryCache } from "./cache";
import { addDevice } from "./devices";
import { getSecret, setSecret } from "./secrets";

// Shapes from Blue Riiot's unofficial cloud API (api.riiotlabs.com/prod) as the community clients (pyblueriiot,
// Home Assistant's blueconnect component) read them. This sandbox can't reach Blue Riiot.
const EMAIL = "pool@example.com";
const PASSWORD = "correct horse battery";
const NOW = Date.UTC(2026, 6, 15, 20); // a July afternoon in Langley

const login = {
  identity_id: "eu-west-1:0000",
  token: "jwt",
  credentials: {
    access_key: "ASIAEXAMPLE",
    secret_key: "secretEXAMPLE",
    session_token: "sessionEXAMPLE",
    expiration: "2099-01-01T00:00:00.000Z",
  },
};
const pools = {
  data: [
    { swimming_pool_id: "pool-1", created: "2024-05-01T00:00:00.000Z", swimming_pool: { swimming_pool_id: "pool-1", name: " Backyard " } },
    { created: "no id" },
  ],
};
const blue = { data: [{ blue_device_serial: "00ABCD", swimming_pool_id: "pool-1" }, { blue_device: { serial: "00EF01" } }, {}] };
const measured = (at: string) => ({
  status: "OK",
  last_blue_measure_timestamp: at,
  blue_device_serial: "00ABCD",
  data: [
    { name: "temperature", timestamp: at, value: 26.44, trend: "increase", ok_min: 20, ok_max: 40, warning_low: null, warning_high: null },
    { name: "ph", timestamp: at, value: 8.34, trend: "stable", ok_min: 7.2, ok_max: 7.6, warning_low: 6.8, warning_high: 8 },
    { name: "orp", timestamp: at, value: 702.4, trend: "decrease", ok_min: 650, ok_max: 750, warning_low: 550, warning_high: 850 },
    { name: "salinity", timestamp: at, value: 3.14, ok_min: 2.7, ok_max: 3.4 },
    { name: "conductivity", timestamp: at, value: 5100 },
  ],
});

function stubBlueRiiot(answers: Partial<Record<string, () => Response>> = {}) {
  const fetch = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/prod/", "");
    void init;
    const answer = answers[path];
    if (answer) return Promise.resolve(answer());
    if (path === "user/login") return Promise.resolve(Response.json(login));
    if (path === "swimming_pool") return Promise.resolve(Response.json(pools));
    if (path === "swimming_pool/pool-1/blue") return Promise.resolve(Response.json(blue));
    if (path === "swimming_pool/pool-1/blue/00ABCD/lastMeasurements")
      return Promise.resolve(Response.json(measured(new Date(NOW - 20 * 60_000).toISOString())));
    if (path === "swimming_pool/pool-1/blue/00EF01/lastMeasurements") return Promise.resolve(Response.json({ data: [] }));
    return Promise.resolve(new Response("not found", { status: 404 }));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("AWS Signature V4", () => {
  // AWS's published test suite (aws-sig-v4-test-suite): get-vanilla and get-vanilla-query-order-key-case.
  const creds = { accessKey: "AKIDEXAMPLE", secretKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY" };
  const at = Date.UTC(2015, 7, 30, 12, 36);
  const base = { host: "example.amazonaws.com", path: "/", region: "us-east-1", service: "service" };

  it("matches AWS's example signatures", () => {
    expect(signV4(creds, { ...base, query: {} }, at)).toEqual({
      "x-amz-date": "20150830T123600Z",
      Authorization:
        "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
    });
    expect(signV4(creds, { ...base, query: { Param2: "value2", Param1: "value1" } }, at).Authorization).toContain(
      "Signature=b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500",
    );
  });

  it("signs the session token too", () => {
    const h = signV4({ ...creds, sessionToken: "tok" }, { ...base, query: {} }, at);
    expect(h["x-amz-security-token"]).toBe("tok");
    expect(h.Authorization).toContain("SignedHeaders=host;x-amz-date;x-amz-security-token");
  });
});

describe("Blue Riiot levels and trims", () => {
  it("is ok in the ideal range, a warning up to the warning bounds, and bad past them", () => {
    const ph = poolRange("ph", { okMin: 7.2, okMax: 7.6 });
    expect(ph).toEqual({ okMin: 7.2, okMax: 7.6, warnLow: 6.8, warnHigh: 8 });
    expect(poolLevel(7.4, ph)).toBe("ok");
    expect(poolLevel(7.9, ph)).toBe("warn");
    expect(poolLevel(8.1, ph)).toBe("bad");
    expect(poolLevel(6.7, ph)).toBe("bad");
    // No warning bound: out of range is only a warning.
    expect(poolLevel(12, poolRange("temp", { okMin: 20, okMax: 40 }))).toBe("warn");
    // Salinity without Blue Riiot's range isn't coloured.
    expect(poolLevel(3, poolRange("salinity", {}))).toBe("none");
  });

  it("reads pools and devices leniently", () => {
    expect(trimPools(pools)).toEqual([{ id: "pool-1", name: "Backyard" }]);
    expect(trimPools(null)).toEqual([]);
    expect(trimDevices(blue)).toEqual(["00ABCD", "00EF01"]);
  });

  it("keeps the readings we show, levelled, with trends and ideal ranges", () => {
    const at = "2026-07-15T19:40:00.000Z";
    expect(trimMeasurements(measured(at), "metric")).toEqual({
      recorded: Date.parse(at),
      readings: [
        { kind: "temp", value: 26.4, unit: "°C", level: "ok", trend: "up", ideal: { min: 20, max: 40 } },
        { kind: "ph", value: 8.3, unit: "", level: "bad", ideal: { min: 7.2, max: 7.6 } },
        { kind: "orp", value: 702, unit: "mV", level: "ok", trend: "down", ideal: { min: 650, max: 750 } },
        { kind: "salinity", value: 3.1, unit: "g/L", level: "ok", ideal: { min: 2.7, max: 3.4 } },
      ],
    });
  });

  it("gives imperial dashboards °F, keeping the level worked out in °C", () => {
    const [temp] = trimMeasurements(measured("2026-07-15T19:40:00.000Z"), "imperial").readings;
    expect(temp).toEqual({ kind: "temp", value: 79.6, unit: "°F", level: "ok", trend: "up", ideal: { min: 68, max: 104 } });
  });
});

describe("Blue Riiot feed", () => {
  useTestServer();
  afterEach(() => {
    vi.unstubAllGlobals();
    clearMemoryCache();
  });

  it("says it isn't set up without a sign-in, and asks Blue Riiot nothing", async () => {
    const fetch = stubBlueRiiot();
    expect(await blueRiiotFeed(LEGACY_ACCOUNT_ID, defaultConfig(), NOW)).toEqual({ updatedAt: NOW, configured: false, pools: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("signs in once, signs every read, never puts the password in a URL, and shares one read", async () => {
    await setSecret(LEGACY_ACCOUNT_ID, "blueRiiot.email", EMAIL);
    await setSecret(LEGACY_ACCOUNT_ID, "blueRiiot.password", PASSWORD);
    const fetch = stubBlueRiiot();
    const data = await blueRiiotFeed(LEGACY_ACCOUNT_ID, defaultConfig(), NOW);
    expect(data.configured).toBe(true);
    expect(data.pools).toHaveLength(1);
    expect(data.pools[0]).toMatchObject({ id: "pool-1", name: "Backyard", recorded: NOW - 20 * 60_000 });
    expect(data.pools[0]?.readings.map((r) => [r.kind, r.level])).toEqual([
      ["temp", "ok"],
      ["ph", "bad"],
      ["orp", "ok"],
      ["salinity", "ok"],
    ]);
    const logins = fetch.mock.calls.filter(([u]) => String(u).endsWith("/user/login"));
    expect(logins).toHaveLength(1);
    expect(JSON.parse(String(logins[0]?.[1]?.body))).toEqual({ email: EMAIL, password: PASSWORD });
    for (const [u, init] of fetch.mock.calls) {
      expect(String(u)).not.toContain(encodeURIComponent(PASSWORD));
      if (String(u).endsWith("/user/login")) continue;
      const h = new Headers(init?.headers);
      expect(h.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=ASIAEXAMPLE\/\d{8}\/eu-west-1\/execute-api\/aws4_request/);
      expect(h.get("x-amz-security-token")).toBe("sessionEXAMPLE");
    }
    expect(fetch.mock.calls.some(([u]) => String(u).includes("lastMeasurements?mode=blue_and_strip"))).toBe(true);
    const calls = fetch.mock.calls.length;
    await blueRiiotFeed(LEGACY_ACCOUNT_ID, defaultConfig(), NOW + 60_000);
    expect(fetch).toHaveBeenCalledTimes(calls);
  });

  it("says when Blue Riiot refuses the sign-in", async () => {
    await setSecret(LEGACY_ACCOUNT_ID, "blueRiiot.email", "wrong@example.com");
    await setSecret(LEGACY_ACCOUNT_ID, "blueRiiot.password", "nope");
    stubBlueRiiot({ "user/login": () => new Response("no", { status: 401 }) });
    expect(await blueRiiotFeed(LEGACY_ACCOUNT_ID, defaultConfig(), NOW)).toMatchObject({
      configured: true,
      pools: [],
      error: expect.stringContaining("refused"),
    });
  });

  it("serves displays and turns away requests without a display", async () => {
    await setSecret(LEGACY_ACCOUNT_ID, "blueRiiot.email", EMAIL);
    await setSecret(LEGACY_ACCOUNT_ID, "blueRiiot.password", PASSWORD);
    stubBlueRiiot();
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const r = await displayGET(req("/api/display/blueriiot/", { headers: { "x-display-token": token } }));
    expect(((await r.json()) as PoolData).pools[0]?.name).toBe("Backyard");
    expect((await displayGET(req("/api/display/blueriiot/"))).status).toBe(401);
  });
});

describe("Blue Riiot alerts", () => {
  const data: PoolData = {
    updatedAt: NOW,
    configured: true,
    pools: [{ id: "pool-1", name: "Backyard", ...trimMeasurements(measured(new Date(NOW - 20 * 60_000).toISOString()), "metric") }],
  };
  const withAlerts = (alerts: boolean) => {
    const c = defaultConfig();
    c.integrations.smartHome.blueRiiot = { alerts };
    return c;
  };

  it("raises nothing unless switched on", () => {
    expect(poolAlerts(data, withAlerts(false), NOW)).toEqual([]);
  });

  it("raises a reading past the warning range, one id per pool, kind and day, never for temperature", () => {
    expect(poolAlerts(data, withAlerts(true), NOW).map((a) => [a.id, a.severity, a.title, a.description])).toEqual([
      [
        "blueRiiot:ph:pool-1:2026-07-15",
        "moderate",
        "pH high: Backyard",
        "8.3. Blue Riiot's ideal range is 7.2 to 7.6. The Blue Riiot app says what to add.",
      ],
    ]);
  });

  it("ignores readings older than six hours", () => {
    expect(poolAlerts(data, withAlerts(true), NOW + 7 * 3_600_000)).toEqual([]);
  });
});

describe("Settings › Pool", () => {
  useTestServer();
  afterEach(() => {
    vi.unstubAllGlobals();
    clearMemoryCache();
  });

  it("checks the sign-in with Blue Riiot before saving it, and never sends it back", async () => {
    const admin = await cookieFor("admin@example.com");
    const put = () =>
      adminPUT(
        req("/api/household/blueriiot/", {
          method: "PUT",
          headers: { cookie: admin },
          body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
        }),
      );
    stubBlueRiiot({ "user/login": () => new Response("no", { status: 401 }) });
    expect((await put()).status).toBe(400);
    expect(await getSecret(LEGACY_ACCOUNT_ID, "blueRiiot.password")).toBeNull();

    stubBlueRiiot();
    expect(await (await put()).json()).toEqual({ configured: true, pools: [{ id: "pool-1", name: "Backyard" }], error: "" });
    expect(await getSecret(LEGACY_ACCOUNT_ID, "blueRiiot.email")).toBe(EMAIL);
    expect(await getSecret(LEGACY_ACCOUNT_ID, "blueRiiot.password")).toBe(PASSWORD);
    const text = await (await adminGET(req("/api/household/blueriiot/", { headers: { cookie: admin } }))).text();
    expect(JSON.parse(text)).toEqual({ configured: true, pools: [{ id: "pool-1", name: "Backyard" }], error: "" });
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain(EMAIL);
  });
});
