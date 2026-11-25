import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as displayGET } from "@/app/api/display/ecoflow/route";
import { DELETE as adminDELETE, GET as adminGET, PUT as adminPUT } from "@/app/api/household/ecoflow/route";
import type { EcoFlowData } from "@/lib/display/types";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { cookieFor, req, useTestServer } from "@/test/server";

import { clearMemoryCache } from "./cache";
import { loadConfig, saveConfig } from "./config";
import { addDevice } from "./devices";
import { ecoflowFeed, signedHeaders, signString, trimDeviceList, trimQuotas } from "./ecoflow";
import { setSecret } from "./secrets";

// EcoFlow's answers, in the shape its IoT developer documentation and open-source clients show (this sandbox can't
// reach EcoFlow). A Delta 2 reports pd.* / inv.* / mppt.* (solar in tenths of a watt); a Delta Pro 3 the pow* names.
const delta2 = {
  "pd.soc": 82,
  "pd.wattsInSum": 412,
  "pd.wattsOutSum": 96,
  "inv.inputWatts": 0,
  "inv.outputWatts": 60,
  "mppt.inWatts": 4123,
  "bms_emsStatus.chgRemainTime": 45,
  "bms_emsStatus.dsgRemainTime": 5999,
};
const deltaPro3 = { cmsBattSoc: 40.6, powInSumW: 0, powOutSumW: 350, powGetPvH: 0, powGetPvL: 0, powGetAcOut: 300, cmsDsgRemTime: 190 };
const listed = (sn: string, name: string) => ({ sn, name, product: "", online: true });

describe("EcoFlow signing", () => {
  it("signs the sorted parameters, then the access key, nonce and timestamp", () => {
    expect(signString({ sn: "R331ZEB4ZE123456" }, "AK", "123456", "1700000000000")).toBe(
      "sn=R331ZEB4ZE123456&accessKey=AK&nonce=123456&timestamp=1700000000000",
    );
    expect(signString({ b: 2, a: { y: 1, x: [3, 4] } }, "AK", "1", "2")).toBe(
      "a.x[0]=3&a.x[1]=4&a.y=1&b=2&accessKey=AK&nonce=1&timestamp=2",
    );
    expect(signString({}, "AK", "1", "2")).toBe("accessKey=AK&nonce=1&timestamp=2");
  });

  it("sends a hex HMAC-SHA256 of that string keyed by the secret key", () => {
    const headers = signedHeaders({ accessKey: "AK", secretKey: "SK" }, { sn: "X" }, 1_700_000_000_000, "654321");
    const expected = createHmac("sha256", "SK").update("sn=X&accessKey=AK&nonce=654321&timestamp=1700000000000").digest("hex");
    expect(headers).toEqual({ accessKey: "AK", nonce: "654321", timestamp: "1700000000000", sign: expected });
  });
});

describe("EcoFlow readings", () => {
  it("reads a Delta 2 while it charges from solar", () => {
    expect(trimQuotas(delta2, listed("R331", "Garage Delta 2"))).toEqual({
      sn: "R331",
      name: "Garage Delta 2",
      online: true,
      soc: 82,
      inW: 412,
      outW: 96,
      solarW: 412,
      acInW: 0,
      acOutW: 60,
      dcOutW: 36,
      charging: true,
      minutes: 45,
    });
  });

  it("reads a Delta Pro 3 running the house, with time to empty", () => {
    expect(trimQuotas(deltaPro3, listed("MR51", "Delta Pro 3"))).toMatchObject({
      soc: 41,
      inW: 0,
      outW: 350,
      solarW: 0,
      acOutW: 300,
      dcOutW: 50,
      charging: false,
      minutes: 190,
    });
  });

  it("leaves out what a device doesn't report and EcoFlow's 5999-minute 'don't know'", () => {
    const d = trimQuotas(
      { "pd.soc": "100", "pd.wattsInSum": 30, "pd.wattsOutSum": 0, "bms_emsStatus.chgRemainTime": 5999 },
      listed("A", "A"),
    );
    expect(d).toMatchObject({ soc: 100, inW: 30, charging: false });
    expect(d.minutes).toBeUndefined();
    expect(d.solarW).toBeUndefined();
    expect(trimQuotas({ "2_1.watts": 1234 }, listed("HW52", "Plug"))).toMatchObject({ outW: 123, soc: undefined });
  });

  it("names each device, falling back to its product and serial", () => {
    expect(
      trimDeviceList([
        { sn: "A1", deviceName: "Cabin", productName: "RIVER 2", online: 1 },
        { sn: "B2", deviceName: " ", productName: "DELTA Max", online: 0 },
        { sn: "C3" },
        { deviceName: "no serial" },
      ]),
    ).toEqual([
      { sn: "A1", name: "Cabin", product: "RIVER 2", online: true },
      { sn: "B2", name: "DELTA Max", product: "DELTA Max", online: false },
      { sn: "C3", name: "C3", product: "", online: false },
    ]);
  });
});

function ecoflowFetch(opts: { failOn?: string; refuseHost?: string } = {}) {
  return vi.fn((input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const ok = (data: unknown) => Promise.resolve(new Response(JSON.stringify({ code: "0", message: "Success", data })));
    if (url.origin === opts.refuseHost)
      return Promise.resolve(new Response(JSON.stringify({ code: "8521", message: "accessKey is invalid" })));
    const h = new Headers(init?.headers);
    if (!h.get("sign") || h.get("accessKey") !== "access-key-1") return Promise.resolve(new Response("{}", { status: 401 }));
    if (url.pathname === "/iot-open/sign/device/list")
      return ok([
        { sn: "R331", deviceName: "Garage Delta 2", productName: "DELTA 2", online: 1 },
        { sn: "MR51", deviceName: "Delta Pro 3", productName: "DELTA Pro 3", online: 1 },
        { sn: "R601", deviceName: "Cabin River", productName: "RIVER 2", online: 1 },
      ]);
    const sn = url.searchParams.get("sn");
    if (sn === opts.failOn) return Promise.resolve(new Response("{}", { status: 500 }));
    return ok(sn === "R331" ? delta2 : sn === "MR51" ? deltaPro3 : { "pd.soc": 12, "pd.wattsInSum": 0, "pd.wattsOutSum": 20 });
  });
}

describe("EcoFlow feed", () => {
  useTestServer();
  afterEach(() => {
    vi.unstubAllGlobals();
    clearMemoryCache();
  });

  async function withWidget(devices: string[]) {
    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    const c = structuredClone(stored.config);
    c.views[0]!.widgets = [
      {
        id: "power",
        type: "ecoflow",
        x: 0,
        y: 0,
        w: 4,
        h: 3,
        showBackground: true,
        devices,
        showSolar: true,
        showFlows: true,
        showTime: true,
      },
    ];
    await saveConfig(LEGACY_ACCOUNT_ID, c, stored.version);
    return (await loadConfig(LEGACY_ACCOUNT_ID)).config;
  }

  async function withKeys() {
    await setSecret(LEGACY_ACCOUNT_ID, "ecoflow.accessKey", "access-key-1");
    await setSecret(LEGACY_ACCOUNT_ID, "ecoflow.secretKey", "secret-key-1");
  }

  it("says it isn't set up before keys are saved, without calling EcoFlow", async () => {
    const fetch = ecoflowFetch();
    vi.stubGlobal("fetch", fetch);
    const config = await withWidget([]);
    expect(await ecoflowFeed(LEGACY_ACCOUNT_ID, config)).toMatchObject({ configured: false, devices: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads only the devices on widgets, and one failing never hides the others", async () => {
    const fetch = ecoflowFetch({ failOn: "MR51" });
    vi.stubGlobal("fetch", fetch);
    await withKeys();
    const config = await withWidget(["R331", "MR51"]);
    const feed = await ecoflowFeed(LEGACY_ACCOUNT_ID, config, 1_000_000);
    expect(feed.devices.map((d) => [d.sn, d.soc, d.online])).toEqual([
      ["R331", 82, true],
      ["MR51", undefined, false],
    ]);
    const asked = fetch.mock.calls.map((c) => new URL(String(c[0])).searchParams.get("sn")).filter(Boolean);
    expect(asked.sort()).toEqual(["MR51", "R331"]);
  });

  it("tries the next regional host when one refuses the keys", async () => {
    vi.stubGlobal("fetch", ecoflowFetch({ refuseHost: "https://api-a.ecoflow.com" }));
    await withKeys();
    const feed = await ecoflowFeed(LEGACY_ACCOUNT_ID, await withWidget([]), 1_000_000);
    expect(feed.devices.map((d) => d.sn)).toEqual(["R331", "MR51", "R601"]);
  });

  it("reads each device at most once a minute", async () => {
    const fetch = ecoflowFetch();
    vi.stubGlobal("fetch", fetch);
    await withKeys();
    const config = await withWidget(["R601"]);
    await ecoflowFeed(LEGACY_ACCOUNT_ID, config, 1_000_000);
    await ecoflowFeed(LEGACY_ACCOUNT_ID, config, 1_030_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    await ecoflowFeed(LEGACY_ACCOUNT_ID, config, 1_070_000);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("serves displays the readings, and admins the device list, never the keys", async () => {
    vi.stubGlobal("fetch", ecoflowFetch());
    await withWidget(["R331"]);
    const admin = await cookieFor("admin@example.com");
    expect(await (await adminGET(req("/api/household/ecoflow/", { headers: { cookie: admin } }))).json()).toEqual({
      connected: false,
      devices: [],
      error: "",
    });
    const put = await adminPUT(
      req("/api/household/ecoflow/", {
        method: "PUT",
        headers: { cookie: admin },
        body: JSON.stringify({ accessKey: "access-key-1", secretKey: "secret-key-1" }),
      }),
    );
    expect(put.status).toBe(200);
    const listing = (await (await adminGET(req("/api/household/ecoflow/", { headers: { cookie: admin } }))).json()) as {
      devices: unknown[];
    };
    expect(listing.devices).toHaveLength(3);

    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const r = await displayGET(req("/api/display/ecoflow/", { headers: { "x-display-token": token } }));
    const body = await r.text();
    expect(body).not.toContain("secret-key-1");
    expect(body).not.toContain("access-key-1");
    const data = JSON.parse(body) as EcoFlowData;
    expect(data.devices.map((d) => d.name)).toEqual(["Garage Delta 2"]);
    expect((await displayGET(req("/api/display/ecoflow/"))).status).toBe(401);

    const kid = await cookieFor("kid@example.com");
    expect((await adminGET(req("/api/household/ecoflow/", { headers: { cookie: kid } }))).status).toBe(401);
    expect((await adminDELETE(req("/api/household/ecoflow/", { method: "DELETE", headers: { cookie: admin } }))).status).toBe(200);
    expect(await (await adminGET(req("/api/household/ecoflow/", { headers: { cookie: admin } }))).json()).toMatchObject({
      connected: false,
    });
  });
});
