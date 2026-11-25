import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as watchGET } from "@/app/api/display/config-watch/route";
import { POST as refreshPOST } from "@/app/api/household/refresh/route";
import { defaultConfig } from "@/lib/config/defaults";
import { createAccount, LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { finishSignIn, sessionCookie, startSignIn } from "@/server/auth";
import { configVersion, saveConfig } from "@/server/config";
import { cookieFor, req, useTestServer } from "@/test/server";

import { addDevice } from "./devices";

useTestServer();

async function cookieForMember(email: string): Promise<string> {
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  await startSignIn(req("/api/auth/start/", { method: "POST" }), email, "http://localhost");
  const printed = info.mock.calls.map((c) => String(c[0])).join("\n");
  info.mockRestore();
  const token = /token=([A-Za-z0-9_%-]+)/.exec(printed)?.[1];
  const done = await finishSignIn(decodeURIComponent(token ?? ""));
  if (!done) throw new Error("Sign-in failed");
  return sessionCookie(done.sessionToken).split(";")[0] ?? "";
}

describe("Refresh displays", () => {
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
});
