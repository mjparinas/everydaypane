import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as watchGET } from "@/app/api/display/config-watch/route";
import { GET as stateGET } from "@/app/api/display/state/route";
import { POST as refreshPOST } from "@/app/api/household/refresh/route";
import { defaultConfig } from "@/lib/config/defaults";
import { createAccount, LEGACY_ACCOUNT_ID, setAccountPlan } from "@/server/accounts";
import { issueTestSession, testSessionCookie } from "@/server/auth";
import * as changes from "@/server/changes";
import { configVersion, saveConfig, touchConfig } from "@/server/config";
import { cookieFor, req, useTestServer } from "@/test/server";

import { addDevice } from "./devices";
import { postMessage } from "./messages";
import { addShoppingItem } from "./shopping";

async function cookieForMember(email: string): Promise<string> {
  const session = await issueTestSession(email);
  if (!session) throw new Error("Sign-in failed");
  return testSessionCookie(session).split(";")[0] ?? "";
}

describe("Refresh displays", () => {
  useTestServer();

  beforeEach(async () => {
    await saveConfig(LEGACY_ACCOUNT_ID, defaultConfig(), 0);
  });

  it("bumps the settings version for a Household admin", async () => {
    const cookie = await cookieFor("admin@example.com");
    const before = await configVersion(LEGACY_ACCOUNT_ID);
    const r = await refreshPOST(req("/api/household/refresh/", { method: "POST", headers: { cookie } }));
    expect(r.status).toBe(200);
    expect(await configVersion(LEGACY_ACCOUNT_ID)).toBe(before + 1);
  });

  it("refuses Free households with 402", async () => {
    await createAccount("Free home", "free.refresh@example.com", undefined, { trial: false });
    const cookie = await cookieForMember("free.refresh@example.com");
    const r = await refreshPOST(req("/api/household/refresh/", { method: "POST", headers: { cookie } }));
    expect(r.status).toBe(402);
  });

  it("notifies an existing wall of plan changes without a settings save", async () => {
    const account = await createAccount("Free home", "upgrade.refresh@example.com", undefined, { trial: false });
    const { token } = await addDevice(account.id, "Kitchen", null);
    const state = (etag?: string) =>
      stateGET(req("/api/display/state/", { headers: { "x-display-token": token, "if-none-match": etag ?? "" } }));
    const before = await state();
    expect(await before.json()).toMatchObject({ instantRefresh: false });

    await setAccountPlan(account.id, "paid");
    const upgraded = await state(before.headers.get("etag")!);
    expect(upgraded.status).toBe(200);
    expect(await upgraded.json()).toMatchObject({ instantRefresh: true });
    expect((await state(upgraded.headers.get("etag")!)).status).toBe(304);

    await setAccountPlan(account.id, "free");
    const downgraded = await state(upgraded.headers.get("etag")!);
    expect(downgraded.status).toBe(200);
    expect(await downgraded.json()).toMatchObject({ instantRefresh: false });
  });

  it("wakes a waiting config-watch when the version moves", async () => {
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const since = await configVersion(LEGACY_ACCOUNT_ID);
    const watching = watchGET(req(`/api/display/config-watch/?since=${since}`, { headers: { "x-display-token": token } }));
    // Give the long-poll a tick so it is sitting in its wait loop.
    await new Promise((r) => setTimeout(r, 50));
    const cookie = await cookieFor("admin@example.com");
    expect((await refreshPOST(req("/api/household/refresh/", { method: "POST", headers: { cookie } }))).status).toBe(200);
    const body = (await (await watching).json()) as { version: number };
    expect(body.version).toBeGreaterThan(since);
  });

  it("ticks config-watch every 2.5 seconds rather than every second", async () => {
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const since = await configVersion(LEGACY_ACCOUNT_ID);
    const spy = vi.spyOn(changes, "versions");
    vi.useFakeTimers();
    try {
      const watching = watchGET(req(`/api/display/config-watch/?since=${since}`, { headers: { "x-display-token": token } }));
      await vi.advanceTimersByTimeAsync(0);
      expect(spy).toHaveBeenCalledTimes(1);

      // No second DB read at 1s or 2.4s.
      await vi.advanceTimersByTimeAsync(1_000);
      expect(spy).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1_400);
      expect(spy).toHaveBeenCalledTimes(1);

      await touchConfig(LEGACY_ACCOUNT_ID);
      await vi.advanceTimersByTimeAsync(100);
      expect(spy).toHaveBeenCalledTimes(2);
      const body = (await (await watching).json()) as { version: number };
      expect(body.version).toBe(since + 1);
    } finally {
      vi.useRealTimers();
      spy.mockRestore();
    }
  });

  it("includes the release version on both changed and unchanged state responses", async () => {
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const headers = { "x-display-token": token };
    const response = await stateGET(req("/api/display/state/", { headers }));
    expect(response.status).toBe(200);
    const etag = response.headers.get("etag");
    const release = response.headers.get("x-display-release");
    expect(etag).toBeTruthy();
    expect(release).toBeTruthy();

    const unchanged = await stateGET(req("/api/display/state/", { headers: { ...headers, "if-none-match": etag ?? "" } }));
    expect(unchanged.status).toBe(304);
    expect(unchanged.headers.get("etag")).toBe(etag);
    expect(unchanged.headers.get("x-display-release")).toBe(release);
  });

  describe("family lists on the same long-poll", () => {
    const watch = (token: string, query: string) =>
      watchGET(req(`/api/display/config-watch/?${query}`, { headers: { "x-display-token": token } }));

    it("answers a first look at once with the counters", async () => {
      const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
      await addShoppingItem(LEGACY_ACCOUNT_ID, { text: "Milk", by: "test" });
      const since = await configVersion(LEGACY_ACCOUNT_ID);
      const started = Date.now();
      const body = (await (await watch(token, `since=${since}&feeds=1`)).json()) as { version: number; feeds: Record<string, number> };
      expect(Date.now() - started).toBeLessThan(1_000);
      expect(body.version).toBe(since);
      expect(body.feeds.shopping).toBeGreaterThan(0);
    });

    it("wakes when a phone posts a message and names the list", async () => {
      const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
      const since = await configVersion(LEGACY_ACCOUNT_ID);
      const first = (await (await watch(token, `since=${since}&feeds=1`)).json()) as { feeds: Record<string, number> };
      const seen = Object.entries(first.feeds)
        .map(([k, v]) => `${k}:${v}`)
        .join(",");
      const watching = watch(token, `since=${since}&seen=${seen}`);
      await new Promise((r) => setTimeout(r, 50));
      await postMessage(LEGACY_ACCOUNT_ID, { author: "Sam", text: "Back at 6", colour: "blue", expiresInHours: null, postedBy: "sam" });
      const body = (await (await watching).json()) as { version: number; feeds: Record<string, number> };
      expect(body.version).toBe(since);
      expect(body.feeds.messages).toBe((first.feeds.messages ?? 0) + 1);
      expect(body.feeds.shopping ?? 0).toBe(first.feeds.shopping ?? 0);
    });
  });
});
