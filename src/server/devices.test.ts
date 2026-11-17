import { describe, expect, it } from "vitest";

import { GET, POST } from "@/app/api/admin/devices/[id]/route";
import { cookieFor, req, useTestServer } from "@/test/server";

import { query } from "./db";
import { addDevice, deviceForToken } from "./devices";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const tokenOf = (url: string) => /\/d\/([^/]+)\//.exec(url)?.[1] ?? "";

describe("display addresses", () => {
  useTestServer();

  it("shows an admin a display's address again, and keeps the token encrypted", async () => {
    const { device, token } = await addDevice("Kitchen", null);
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
    expect(fresh).not.toBe(token);
    expect(await deviceForToken(token)).toBeNull();
    expect((await deviceForToken(fresh))?.id).toBe(device.id);
  });

  it("offers only a new link for a display added before addresses were kept", async () => {
    const { device } = await addDevice("Hall", null);
    await query("UPDATE devices SET token_sealed = NULL WHERE id = ?", [device.id]);
    const admin = await cookieFor("admin@example.com");
    expect((await GET(req(`/api/admin/devices/${device.id}/`, { headers: { cookie: admin } }), ctx(device.id))).status).toBe(404);
  });
});
