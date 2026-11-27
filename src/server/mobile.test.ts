import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { DELETE as deviceDELETE, PATCH as devicePATCH } from "@/app/api/mobile/devices/[id]/route";
import { POST as registerPOST } from "@/app/api/mobile/devices/route";
import { POST as presencePOST } from "@/app/api/mobile/presence/route";
import { GET as widgetGET } from "@/app/api/mobile/widget/route";
import type { DashboardConfig } from "@/lib/config/schema";
import type { EmergencyAlert } from "@/lib/display/types";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { cookieFor, req, useTestServer } from "@/test/server";

import { listMobileDevices, registerMobileDevice } from "./mobile";
import { apnsDead, apnsPayload, fcmBody, parseServiceAccount, pushClaims, pushNewAlerts, pushNewMessage, pushWorthy } from "./push";
import { addShoppingItem } from "./shopping";

const APNS = "a".repeat(64);

async function register(cookie: string, body: Record<string, unknown> = {}, token?: string) {
  const res = await registerPOST(
    req("/api/mobile/devices/", {
      method: "POST",
      headers: { cookie, ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ platform: "ios", name: "iPhone", pushToken: APNS, pushEnv: "sandbox", ...body }),
    }),
  );
  return { status: res.status, body: (await res.json()) as { device: { id: string; push: boolean }; appToken: string | null } };
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("phones running the app", () => {
  useTestServer();

  it("registers once, hands the app token out once, and updates on the next launch", async () => {
    const cookie = await cookieFor("admin@example.com");
    const first = await register(cookie);
    expect(first.status).toBe(200);
    expect(first.body.appToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(first.body.device.push).toBe(true);
    const again = await register(cookie, { pushToken: "b".repeat(64) }, first.body.appToken ?? "");
    expect(again.body.device.id).toBe(first.body.device.id);
    expect(again.body.appToken).toBeNull();
    const devices = await listMobileDevices(LEGACY_ACCOUNT_ID);
    expect(devices).toHaveLength(1);
    expect(devices[0]?.pushToken).toBe("b".repeat(64));
  });

  it("needs a signed-in person", async () => {
    expect((await register("")).status).toBe(401);
  });

  it("drops the old registration when someone else signs in on the same phone", async () => {
    const admin = await register(await cookieFor("admin@example.com"));
    const kid = await register(await cookieFor("kid@example.com"), {}, admin.body.appToken ?? "");
    expect(kid.body.device.id).not.toBe(admin.body.device.id);
    const devices = await listMobileDevices(LEGACY_ACCOUNT_ID);
    expect(devices.map((d) => d.email)).toEqual(["kid@example.com"]);
  });

  it("moves a push token to the newest device that reports it", async () => {
    const session = { accountId: LEGACY_ACCOUNT_ID, email: "admin@example.com" };
    const input = { platform: "ios" as const, name: "iPhone", pushToken: APNS, pushEnv: "production" as const };
    await registerMobileDevice(session, input, null);
    await registerMobileDevice(session, input, null);
    const devices = await listMobileDevices(LEGACY_ACCOUNT_ID);
    expect(devices.filter((d) => d.pushToken === APNS)).toHaveLength(1);
  });

  it("serves the widget summary to the app token only", async () => {
    const { body } = await register(await cookieFor("admin@example.com"));
    await addShoppingItem(LEGACY_ACCOUNT_ID, { text: "Milk", by: "test" });
    expect((await widgetGET(req("/api/mobile/widget/"))).status).toBe(401);
    const res = await widgetGET(req("/api/mobile/widget/", { headers: { authorization: `Bearer ${body.appToken}` } }));
    expect(res.status).toBe(200);
    const summary = (await res.json()) as { shopping: { open: number; items: string[] } };
    expect(summary.shopping).toMatchObject({ open: 1, items: ["Milk"] });
  });

  it("keeps home or away only while sharing is on, and forgets it when switched off", async () => {
    const cookie = await cookieFor("admin@example.com");
    const { body } = await register(cookie);
    const auth = { authorization: `Bearer ${body.appToken}` };
    const say = (state: string) =>
      presencePOST(req("/api/mobile/presence/", { method: "POST", headers: auth, body: JSON.stringify({ state }) }));
    expect(await (await say("home")).json()).toEqual({ saved: false });
    const on = await devicePATCH(
      req(`/api/mobile/devices/${body.device.id}/`, {
        method: "PATCH",
        headers: { cookie },
        body: JSON.stringify({ sharePresence: true }),
      }),
      ctx(body.device.id),
    );
    expect(on.status).toBe(200);
    expect(await (await say("home")).json()).toEqual({ saved: true });
    expect((await listMobileDevices(LEGACY_ACCOUNT_ID))[0]?.presence).toBe("home");
    await devicePATCH(
      req(`/api/mobile/devices/${body.device.id}/`, {
        method: "PATCH",
        headers: { cookie },
        body: JSON.stringify({ sharePresence: false }),
      }),
      ctx(body.device.id),
    );
    expect((await listMobileDevices(LEGACY_ACCOUNT_ID))[0]?.presence).toBeNull();
    expect((await say("sideways")).status).toBe(400);
  });

  it("lets only its own person (or an admin) change or remove a phone", async () => {
    const kid = await cookieFor("kid@example.com");
    const admin = await cookieFor("admin@example.com");
    const { body } = await register(admin);
    const patch = await devicePATCH(
      req(`/api/mobile/devices/${body.device.id}/`, {
        method: "PATCH",
        headers: { cookie: kid },
        body: JSON.stringify({ notifyMessages: false }),
      }),
      ctx(body.device.id),
    );
    expect(patch.status).toBe(404);
    const del = await deviceDELETE(
      req(`/api/mobile/devices/${body.device.id}/`, { method: "DELETE", headers: { cookie: admin } }),
      ctx(body.device.id),
    );
    expect(await del.json()).toEqual({ removed: true });
    expect((await widgetGET(req("/api/mobile/widget/", { headers: { authorization: `Bearer ${body.appToken}` } }))).status).toBe(401);
  });
});

describe("push notifications", () => {
  useTestServer();

  const alert = (over: Partial<EmergencyAlert>): EmergencyAlert => ({
    id: "a1",
    source: "weather",
    severity: "severe",
    title: "Rainfall warning",
    area: "Metro Vancouver",
    description: "",
    sent: Date.now(),
    expires: null,
    ...over,
  });
  const config = { alerts: { enabled: true, banner: "severe" } } as unknown as DashboardConfig;

  it("pushes strip-worthy alerts and laundry, never other household notices", () => {
    const worthy = pushWorthy(
      [
        alert({ id: "rain" }),
        alert({ id: "minor", severity: "minor" }),
        alert({ id: "washer", source: "laundry", severity: "minor", notice: true }),
        alert({ id: "frost", source: "smart", severity: "minor", notice: true }),
      ],
      config,
    );
    expect(worthy.map((a) => a.id)).toEqual(["rain", "washer"]);
    expect(pushWorthy([alert({})], { alerts: { enabled: false, banner: "severe" } } as unknown as DashboardConfig)).toEqual([]);
  });

  it("sends nothing without Everydaypane's keys", async () => {
    await registerMobileDevice(
      { accountId: LEGACY_ACCOUNT_ID, email: "kid@example.com" },
      { platform: "android", name: "Pixel", pushToken: "f".repeat(140), pushEnv: "production" },
      null,
    );
    expect(await pushNewMessage(LEGACY_ACCOUNT_ID, { author: "Mom", text: "Dinner at 6", postedBy: "admin@example.com" })).toBe(0);
    expect(await pushNewAlerts(LEGACY_ACCOUNT_ID, config, [alert({})])).toBe(0);
    expect(await pushClaims(LEGACY_ACCOUNT_ID)).toEqual([]);
  });

  it("claims each alert once, so two walls reading it push it once", async () => {
    vi.stubEnv("FCM_SERVICE_ACCOUNT", JSON.stringify({ project_id: "p", client_email: "x@p.iam.gserviceaccount.com", private_key: "bad" }));
    await registerMobileDevice(
      { accountId: LEGACY_ACCOUNT_ID, email: "kid@example.com" },
      { platform: "android", name: "Pixel", pushToken: "f".repeat(140), pushEnv: "production" },
      null,
    );
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await pushNewAlerts(LEGACY_ACCOUNT_ID, config, [alert({ id: "rain", sent: 5 })], 6);
    await pushNewAlerts(LEGACY_ACCOUNT_ID, config, [alert({ id: "rain", sent: 5 })], 7);
    errors.mockRestore();
    expect(await pushClaims(LEGACY_ACCOUNT_ID)).toEqual(["alert:rain:5"]);
  });

  it("skips alerts older than six hours", async () => {
    vi.stubEnv("FCM_SERVICE_ACCOUNT", JSON.stringify({ project_id: "p", client_email: "x@p.iam.gserviceaccount.com", private_key: "bad" }));
    await registerMobileDevice(
      { accountId: LEGACY_ACCOUNT_ID, email: "kid@example.com" },
      { platform: "android", name: "Pixel", pushToken: "f".repeat(140), pushEnv: "production" },
      null,
    );
    expect(await pushNewAlerts(LEGACY_ACCOUNT_ID, config, [alert({ sent: 0 })], 7 * 3_600_000)).toBe(0);
    expect(await pushClaims(LEGACY_ACCOUNT_ID)).toEqual([]);
  });

  it("reads the service account as JSON or base64", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const sa = {
      project_id: "everydaypane",
      client_email: "push@everydaypane.iam.gserviceaccount.com",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
    };
    expect(parseServiceAccount(JSON.stringify(sa))?.project_id).toBe("everydaypane");
    expect(parseServiceAccount(Buffer.from(JSON.stringify(sa)).toString("base64"))?.client_email).toBe(sa.client_email);
    expect(parseServiceAccount("{}")).toBeNull();
    expect(parseServiceAccount("")).toBeNull();
  });

  it("shapes APNs and FCM messages and spots dead tokens", () => {
    const m = { title: "Mom", body: "Dinner at 6", url: "/family/", kind: "messages" as const };
    expect(JSON.parse(apnsPayload(m))).toEqual({
      aps: { alert: { title: "Mom", body: "Dinner at 6" }, sound: "default", "thread-id": "messages" },
      url: "/family/",
      kind: "messages",
    });
    expect(fcmBody("tok", m).message).toMatchObject({
      token: "tok",
      data: { url: "/family/" },
      android: { notification: { channel_id: "messages" } },
    });
    expect(apnsDead(410, "Unregistered")).toBe(true);
    expect(apnsDead(400, "BadDeviceToken")).toBe(true);
    expect(apnsDead(400, "PayloadEmpty")).toBe(false);
    expect(apnsDead(500, "")).toBe(false);
  });
});
