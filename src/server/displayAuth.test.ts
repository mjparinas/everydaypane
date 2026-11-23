import { describe, expect, it } from "vitest";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";

import { GET as photoGET } from "@/app/api/display/photo/route";
import { cookieFor, req, useTestServer } from "@/test/server";

import { addDevice } from "./devices";
import { DISPLAY_COOKIE, displayCookieHeader, sealDisplayCookie } from "./displayAuth";
import { viewerFor } from "./viewer";

describe("display cookie for image routes", () => {
  useTestServer();

  it("authenticates image requests without ?t=", async () => {
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const cookie = displayCookieHeader(token).split(";")[0] ?? "";
    const viewer = await viewerFor(req("/api/display/photo/?s=x&i=y", { headers: { cookie } }));
    expect(viewer?.kind).toBe("device");
    expect(await viewerFor(req("/api/display/photo/?s=x&i=y"))).toBeNull();
  });

  it("rejects a tampered or expired cookie", async () => {
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const sealed = sealDisplayCookie(token, Date.now() - 8 * 86_400_000);
    expect(await viewerFor(req("/api/display/photo/", { headers: { cookie: `${DISPLAY_COOKIE}=${sealed}` } }))).toBeNull();
    expect(await viewerFor(req("/api/display/photo/", { headers: { cookie: `${DISPLAY_COOKIE}=${sealed}x` } }))).toBeNull();
  });

  it("lets an admin preview use a session, and refuses a family session", async () => {
    const admin = await cookieFor("admin@example.com");
    const family = await cookieFor("kid@example.com");
    expect((await viewerFor(req("/api/display/photo/", { headers: { cookie: admin } })))?.kind).toBe("person");
    expect(await viewerFor(req("/api/display/photo/", { headers: { cookie: family } }))).toBeNull();
    expect((await photoGET(req("/api/display/photo/?s=x&i=y", { headers: { cookie: family } }))).status).toBe(401);
  });
});
