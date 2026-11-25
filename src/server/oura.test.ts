import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as displayGET } from "@/app/api/display/oura/route";
import { DELETE as adminDELETE, GET as adminGET } from "@/app/api/household/content/oura/route";
import { localDate } from "@/lib/calendar";
import { newWidget } from "@/lib/config/widgets";
import type { OuraData } from "@/lib/display/types";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { cookieFor, req, useTestServer } from "@/test/server";

import { clearMemoryCache } from "./cache";
import { loadConfig, saveConfig } from "./config";
import { addDevice } from "./devices";
import { ouraConsentUrl, ouraToken, pickNight, summarize } from "./oura";
import { getSecret, setSecret } from "./secrets";

describe("Oura summaries", () => {
  it("takes the newest scored day up to today and leaves out the rest", () => {
    const out = summarize("2026-11-24", {
      sleep: [
        { day: "2026-11-22", score: 70 },
        { day: "2026-11-23", score: 81.4 },
        { day: "2026-11-25", score: 99 },
        { day: "2026-11-24" },
      ],
      readiness: [{ day: "2026-11-24", score: 77, temperature_deviation: -0.237 }],
      activity: [{ day: "2026-11-24", score: 64, steps: 5321.6 }, "junk"],
      periods: [],
    });
    expect(out).toEqual({
      sleep: { day: "2026-11-23", score: 81 },
      readiness: { day: "2026-11-24", score: 77, temperatureDeviation: -0.2 },
      activity: { day: "2026-11-24", score: 64, steps: 5322 },
    });
  });

  it("describes the main sleep of the score's day, not a nap or a rest period", () => {
    const night = pickNight(
      [
        { day: "2026-11-24", type: "late_nap", total_sleep_duration: 1800 },
        { day: "2026-11-24", type: "rest", total_sleep_duration: 30_000 },
        {
          day: "2026-11-24",
          type: "long_sleep",
          total_sleep_duration: 25_920,
          bedtime_start: "2026-11-23T22:48:00-07:00",
          bedtime_end: "2026-11-24T06:30:00-07:00",
          average_hrv: 41.6,
          lowest_heart_rate: 52,
          efficiency: 91,
        },
        { day: "2026-11-23", type: "long_sleep", total_sleep_duration: 30_000 },
      ],
      "2026-11-24",
    );
    expect(night).toEqual({
      day: "2026-11-24",
      asleepSeconds: 25_920,
      bedtimeStart: "2026-11-23T22:48:00-07:00",
      bedtimeEnd: "2026-11-24T06:30:00-07:00",
      averageHrv: 41.6,
      lowestHeartRate: 52,
      efficiency: 91,
    });
    expect(pickNight([{ day: "2026-11-24", type: "rest", total_sleep_duration: 100 }], "2026-11-24")).toBeUndefined();
  });

  it("asks Oura for the daily summaries only", () => {
    vi.stubEnv("OURA_CLIENT_ID", "client-id");
    const url = new URL(ouraConsentUrl("state-1", "https://pane.example/api/oura/callback/"));
    expect(url.origin + url.pathname).toBe("https://cloud.ouraring.com/oauth/authorize");
    expect(url.searchParams.get("scope")).toBe("daily");
    expect(url.searchParams.get("state")).toBe("state-1");
    vi.unstubAllEnvs();
  });
});

const HOUR = 3_600_000;

describe("Oura on displays", () => {
  useTestServer({ OURA_CLIENT_ID: "client-id", OURA_CLIENT_SECRET: "client-secret" });

  const calls: string[] = [];
  let tokenAnswer: () => Promise<Response>;
  let apiStatus = 200;

  beforeEach(() => {
    clearMemoryCache();
    calls.length = 0;
    apiStatus = 200;
    tokenAnswer = () => Promise.resolve(Response.json({ access_token: "access-2", refresh_token: "refresh-2", expires_in: 86_400 }));
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = String(input);
        calls.push(url);
        if (url === "https://api.ouraring.com/oauth/token") return tokenAnswer();
        if (url.startsWith("https://api.ouraring.com/oauth/revoke")) return Promise.resolve(new Response(null, { status: 200 }));
        if (apiStatus !== 200) return Promise.resolve(new Response("{}", { status: apiStatus }));
        const today = localDate(Date.now(), "America/Vancouver");
        if (url.includes("/daily_sleep?")) return Promise.resolve(Response.json({ data: [{ day: today, score: 82 }], next_token: null }));
        if (url.includes("/daily_readiness?")) return Promise.resolve(Response.json({ data: [{ day: today, score: 76 }] }));
        if (url.includes("/daily_activity?")) return Promise.resolve(Response.json({ data: [{ day: today, score: 90, steps: 8000 }] }));
        if (url.includes("/sleep?"))
          return Promise.resolve(
            Response.json({ data: [{ day: today, type: "long_sleep", total_sleep_duration: 27_000, average_hrv: 40 }] }),
          );
        return Promise.resolve(new Response("not found", { status: 404 }));
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function setUp(showDetails: boolean, access: { token: string; expiresAt: number } | null) {
    await setSecret(LEGACY_ACCOUNT_ID, "oura.refreshToken", "refresh-1");
    if (access) await setSecret(LEGACY_ACCOUNT_ID, "oura.accessToken", JSON.stringify(access));
    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    const config = structuredClone(stored.config);
    config.views[0]!.widgets = [{ ...newWidget("oura", "ring", { x: 0, y: 0 }), showDetails }];
    expect((await saveConfig(LEGACY_ACCOUNT_ID, config, stored.version)).ok).toBe(true);
    return (await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null)).token;
  }

  const read = async (token: string) =>
    (await (await displayGET(req("/api/display/oura/", { headers: { "x-display-token": token } }))).json()) as OuraData;

  it("says so when no ring is connected", async () => {
    const token = (await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null)).token;
    expect(await read(token)).toMatchObject({ connected: false });
    expect(calls).toEqual([]);
  });

  it("sends scores but keeps last night's details off a scores-only wall", async () => {
    const token = await setUp(false, { token: "access-1", expiresAt: Date.now() + HOUR });
    const data = await read(token);
    expect(data).toMatchObject({ connected: true, sleep: { score: 82 }, readiness: { score: 76 }, activity: { score: 90, steps: 8000 } });
    expect(data.night).toBeUndefined();
    // The stored access token was still good, so Oura's single-use refresh token wasn't spent.
    expect(calls.some((u) => u.includes("/oauth/token"))).toBe(false);
    expect(calls.find((u) => u.includes("/daily_sleep?"))).toContain("start_date=");
  });

  it("sends the details when a widget asks for them", async () => {
    const token = await setUp(true, { token: "access-1", expiresAt: Date.now() + HOUR });
    expect((await read(token)).night).toMatchObject({ asleepSeconds: 27_000, averageHrv: 40 });
  });

  it("refreshes an expired token once for parallel requests and keeps the new refresh token", async () => {
    await setUp(false, { token: "access-1", expiresAt: Date.now() - 1 });
    const [a, b] = await Promise.all([ouraToken(LEGACY_ACCOUNT_ID), ouraToken(LEGACY_ACCOUNT_ID)]);
    expect([a, b]).toEqual(["access-2", "access-2"]);
    expect(calls.filter((u) => u.includes("/oauth/token"))).toHaveLength(1);
    expect(await getSecret(LEGACY_ACCOUNT_ID, "oura.refreshToken")).toBe("refresh-2");
    // The next call uses the stored access token: no second refresh.
    expect(await ouraToken(LEGACY_ACCOUNT_ID)).toBe("access-2");
    expect(calls.filter((u) => u.includes("/oauth/token"))).toHaveLength(1);
  });

  it("uses the token another instance just stored when its own refresh token was already spent", async () => {
    await setUp(false, { token: "access-1", expiresAt: Date.now() - 1 });
    tokenAnswer = async () => {
      // Another server instance refreshed first and stored the next pair.
      await setSecret(LEGACY_ACCOUNT_ID, "oura.refreshToken", "refresh-3");
      await setSecret(LEGACY_ACCOUNT_ID, "oura.accessToken", JSON.stringify({ token: "access-3", expiresAt: Date.now() + HOUR }));
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    };
    expect(await ouraToken(LEGACY_ACCOUNT_ID)).toBe("access-3");
  });

  it("shows the wall as disconnected when Oura no longer takes the refresh token", async () => {
    const token = await setUp(false, { token: "access-1", expiresAt: Date.now() - 1 });
    tokenAnswer = () => Promise.resolve(Response.json({ error: "invalid_grant" }, { status: 400 }));
    expect(await read(token)).toMatchObject({ connected: false });
  });

  it("explains a lapsed membership", async () => {
    const token = await setUp(false, { token: "access-1", expiresAt: Date.now() + HOUR });
    apiStatus = 403;
    expect(await read(token)).toMatchObject({ connected: true, error: "Oura shares data only with an active Oura Membership" });
  });

  it("lets only a household admin see the status or disconnect, and disconnecting forgets both tokens", async () => {
    await setUp(false, { token: "access-1", expiresAt: Date.now() + HOUR });
    const kid = await cookieFor("kid@example.com");
    expect((await adminGET(req("/api/household/content/oura/", { headers: { cookie: kid } }))).status).toBe(401);
    const admin = await cookieFor("admin@example.com");
    expect(await (await adminGET(req("/api/household/content/oura/", { headers: { cookie: admin } }))).json()).toEqual({
      configured: true,
      connected: true,
    });
    expect((await adminDELETE(req("/api/household/content/oura/", { method: "DELETE", headers: { cookie: admin } }))).status).toBe(200);
    expect(await getSecret(LEGACY_ACCOUNT_ID, "oura.refreshToken")).toBeNull();
    expect(await getSecret(LEGACY_ACCOUNT_ID, "oura.accessToken")).toBeNull();
    expect(calls.some((u) => u.startsWith("https://api.ouraring.com/oauth/revoke?access_token=access-1"))).toBe(true);
  });
});
