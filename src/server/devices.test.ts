import { describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/admin/devices/[id]/route";
import { GET as listDevices } from "@/app/api/admin/devices/route";
import { cookieFor, req, useTestServer } from "@/test/server";

import * as crypto from "./crypto";
import { query } from "./db";
import { addDevice, deviceForToken } from "./devices";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const tokenOf = (url: string) => /\/d\/([^/]+)\//.exec(url)?.[1] ?? "";

describe("display addresses", () => {
  useTestServer();

  it("lists each display with its address for the Displays tab", async () => {
    const { device, token } = await addDevice("Kitchen", null);
    const admin = await cookieFor("admin@example.com");
    const r = await listDevices(req("/api/admin/devices/", { headers: { cookie: admin } }));
    expect(r.status).toBe(200);
    const body = (await r.json()) as { devices: { id: string; url: string | null }[] };
    expect(body.devices).toHaveLength(1);
    expect(body.devices[0]).toMatchObject({ id: device.id, url: expect.stringContaining(`/d/${token}/`) });
  });

  it("shows an admin a display's address again, and keeps the token encrypted", async () => {
    const { device, token } = await addDevice("Kitchen", null);
    expect(token).toMatch(/^[A-Za-z0-9]{8}$/);
    const admin = await cookieFor("admin@example.com");
    const r = await GET(req(`/api/admin/devices/${device.id}/`, { headers: { cookie: admin } }), ctx(device.id));
    expect(r.status).toBe(200);
    expect(tokenOf(((await r.json()) as { url: string }).url)).toBe(token);
    const [row] = await query<{ token_sealed: string }>("SELECT token_sealed FROM devices WHERE id = ?", [device.id]);
    expect(row?.token_sealed).not.toContain(token);
  });

  it("refuses family members and people who aren't signed in", async () => {
    const { device } = await addDevice("Kitchen", null);
    const kid = await cookieFor("kid@example.com");
    expect((await GET(req(`/api/admin/devices/${device.id}/`, { headers: { cookie: kid } }), ctx(device.id))).status).toBe(401);
    expect((await GET(req(`/api/admin/devices/${device.id}/`), ctx(device.id))).status).toBe(401);
  });

  it("gives a display a new link and the old one stops working", async () => {
    const { device, token } = await addDevice("Kitchen", null);
    const admin = await cookieFor("admin@example.com");
    const r = await POST(req(`/api/admin/devices/${device.id}/`, { method: "POST", headers: { cookie: admin } }), ctx(device.id));
    const fresh = tokenOf(((await r.json()) as { url: string }).url);
    expect(fresh).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(fresh).not.toBe(token);
    expect(await deviceForToken(token)).toBeNull();
    expect((await deviceForToken(fresh))?.id).toBe(device.id);
  });

  it("retries the database constraint instead of duplicating a display code", async () => {
    const first = await addDevice("Kitchen", null);
    const random = vi.spyOn(crypto, "randomAlphanumeric");
    random.mockReturnValueOnce(first.token).mockReturnValueOnce("Aa0Bb1Cc");

    const second = await addDevice("Hall", null);
    expect(second.token).toBe("Aa0Bb1Cc");
    expect((await deviceForToken(first.token))?.id).toBe(first.device.id);
    expect((await deviceForToken(second.token))?.id).toBe(second.device.id);
    expect(await deviceForToken("aa0Bb1Cc")).toBeNull();
    random.mockRestore();
  });

  it("keeps accepting existing 10-character and longer base64url display codes", async () => {
    const { device } = await addDevice("Legacy display", null);
    const previous = "Ab1Cd2Ef3G";
    await query("UPDATE devices SET token_hash = ?, token_sealed = ? WHERE id = ?", [
      crypto.sha256(previous),
      crypto.encrypt(previous),
      device.id,
    ]);
    expect((await deviceForToken(previous))?.id).toBe(device.id);

    const legacy = "abc_DEF-0123456789xyzABC";
    await query("UPDATE devices SET token_hash = ?, token_sealed = ? WHERE id = ?", [
      crypto.sha256(legacy),
      crypto.encrypt(legacy),
      device.id,
    ]);

    expect((await deviceForToken(legacy))?.id).toBe(device.id);
  });

  it("has no address to show for a display added before addresses were kept", async () => {
    const { device } = await addDevice("Hall", null);
    await query("UPDATE devices SET token_sealed = NULL WHERE id = ?", [device.id]);
    const admin = await cookieFor("admin@example.com");
    expect((await GET(req(`/api/admin/devices/${device.id}/`, { headers: { cookie: admin } }), ctx(device.id))).status).toBe(404);
    const listed = await listDevices(req("/api/admin/devices/", { headers: { cookie: admin } }));
    const body = (await listed.json()) as { devices: { id: string; url: string | null }[] };
    expect(body.devices.find((d) => d.id === device.id)?.url).toBeNull();
  });
});
