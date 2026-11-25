import { describe, expect, it } from "vitest";

import { GET as photoGET } from "@/app/api/display/photo/route";
import { createAccount, LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { cookieFor, req, useTestServer } from "@/test/server";

import { addDevice } from "./devices";
import { DISPLAY_COOKIE, DISPLAY_COOKIE_MS, displayCookieHeader, sealDisplayCookie } from "./displayAuth";
import { accountIdOf, viewerFor } from "./viewer";

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
    const sealed = sealDisplayCookie(token, Date.now() - DISPLAY_COOKIE_MS - 86_400_000);
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

  it("prefers the signed-in household over a leftover wall cookie from another account", async () => {
    const other = await createAccount("Other home", "other.wall@example.com");
    const { token } = await addDevice(other.id, "Their kitchen", null);
    const wall = displayCookieHeader(token).split(";")[0] ?? "";
    const admin = await cookieFor("admin@example.com");
    const viewer = await viewerFor(req("/api/display/calendar/", { headers: { cookie: `${admin}; ${wall}` } }));
    expect(viewer?.kind).toBe("person");
    expect(accountIdOf(viewer!)).toBe(LEGACY_ACCOUNT_ID);
    expect(accountIdOf(viewer!)).not.toBe(other.id);
  });

  it("still lets a wall token win when the browser is also signed into household", async () => {
    const other = await createAccount("Token home", "token.wall@example.com");
    const { token } = await addDevice(other.id, "Wall", null);
    const admin = await cookieFor("admin@example.com");
    const viewer = await viewerFor(req("/api/display/calendar/", { headers: { cookie: admin, "x-display-token": token } }));
    expect(viewer?.kind).toBe("device");
    expect(accountIdOf(viewer!)).toBe(other.id);
  });
});
