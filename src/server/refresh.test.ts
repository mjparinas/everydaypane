import { beforeEach, describe, expect, it } from "vitest";

import { GET as watchGET } from "@/app/api/display/config-watch/route";
import { GET as stateGET } from "@/app/api/display/state/route";
import { POST as refreshPOST } from "@/app/api/household/refresh/route";
import { defaultConfig } from "@/lib/config/defaults";
import { createAccount, LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { issueTestSession, testSessionCookie } from "@/server/auth";
import { configVersion, saveConfig } from "@/server/config";
import { cookieFor, req, useTestServer } from "@/test/server";

import { addDevice } from "./devices";

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
    await createAccount("Free home", "free.refresh@example.com");
    const cookie = await cookieForMember("free.refresh@example.com");
    const r = await refreshPOST(req("/api/household/refresh/", { method: "POST", headers: { cookie } }));
    expect(r.status).toBe(402);
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
});
