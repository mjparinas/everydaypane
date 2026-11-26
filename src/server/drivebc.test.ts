import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as imageGET } from "@/app/api/display/drivebc/image/route";
import { GET as feedGET } from "@/app/api/display/drivebc/route";
import { defaultConfig } from "@/lib/config/defaults";
import { widgetSchema, type DashboardConfig } from "@/lib/config/schema";
import { newWidget } from "@/lib/config/widgets";
import type { DriveBcData } from "@/lib/display/types";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { req, useTestServer } from "@/test/server";

import { clearMemoryCache } from "./cache";
import { loadConfig, saveConfig } from "./config";
import { addDevice } from "./devices";
import {
  cameraList,
  camerasInUse,
  clearDriveBcPictures,
  csvRows,
  driveBcFeed,
  driveBcImage,
  findCameras,
  parseCamera,
  parseCsv,
  parseList,
} from "./drivebc";

// DriveBC's site feed (www.drivebc.ca/api/webcams/) has no published schema; these records follow the field names
// DriveBC's own site code and the open data catalogue use. This sandbox can't reach drivebc.ca.
const site = (over: Record<string, unknown>) => ({
  id: 904,
  name: "Hwy 1 at 176 Street - W",
  caption: "Highway 1 at 176 Street in Surrey, looking west.",
  highway: "1",
  region_name: "Lower Mainland",
  location: { type: "Point", coordinates: [-122.7553, 49.1683] },
  orientation: "W",
  is_on: true,
  should_appear: true,
  marked_stale: false,
  marked_delayed: false,
  last_update_modified: "2026-11-25T15:30:00-08:00",
  ...over,
});
const answer = [
  site({}),
  site({
    id: 292,
    name: "Port Mann Bridge - W",
    caption: "Highway 1 at the Port Mann Bridge, looking west.",
    location: { type: "Point", coordinates: [-122.8114, 49.2196] },
  }),
  site({
    id: 685,
    name: "Coquihalla Summit - N",
    caption: "Highway 5 at the Coquihalla Summit, looking north.",
    highway: "5",
    region_name: "Southern Interior",
    location: { type: "Point", coordinates: [-121.0636, 49.6067] },
    marked_delayed: true,
  }),
  site({
    id: 12,
    name: "Closed one",
    caption: "Highway 1 in Kamloops.",
    is_on: false,
    location: { type: "Point", coordinates: [-120.3, 50.7] },
  }),
  { id: "not-a-number", name: "Broken" },
];

// The open data CSV's header and first row, as the catalogue published it on 2026-11-07.
const CSV = [
  "id,cam_group,camName,links_camDetailsPage,links_imageURL,highway_number,caption,credit,region_name,orientation,latitude,longitude,elevation",
  '520,520,Britannia - S,https://www.drivebc.ca/cameras/520,https://www.drivebc.ca/images/520.jpg,99,"Highway 99 at Copper Drive in Britannia Beach, looking south.",,Lower Mainland,S,49.623919,-123.206245,13',
  '939,914,Elkford - S,https://www.drivebc.ca/cameras/939,https://www.drivebc.ca/images/939.jpg,43,"Highway 43 at Fording River Road in Elkford, looking south.","* View may ""temporarily"" change",Southern Interior,S,50.021677,-114.916704,1265',
].join("\r\n");

const langley = { latitude: 49.1044, longitude: -122.6604 };
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

function withCameras(ids: string[]): DashboardConfig {
  const c = defaultConfig();
  c.views[0]!.widgets = [{ ...newWidget("drivebc", "dbc", { x: 0, y: 0 }), cameras: ids.map((id) => ({ id, name: `Camera ${id}` })) }];
  return c;
}

describe("DriveBC camera list", () => {
  it("reads site records leniently: GeoJSON places, off and delayed cameras, bad ids dropped", () => {
    const list = parseList(answer);
    expect(list.map((c) => c.id)).toEqual(["904", "292", "685", "12"]);
    expect(list[0]).toEqual({
      id: "904",
      name: "Hwy 1 at 176 Street - W",
      caption: "Highway 1 at 176 Street in Surrey, looking west.",
      highway: "1",
      region: "Lower Mainland",
      lat: 49.1683,
      lon: -122.7553,
      updated: Date.parse("2026-11-25T23:30:00Z"),
      state: "ok",
    });
    expect(list[2]!.state).toBe("late");
    expect(list[3]!.state).toBe("off");
  });

  it("also takes the older v1 shape (camName, nested highway and region)", () => {
    expect(
      parseCamera({
        id: 2,
        camName: "Yale - N",
        highway: { number: "1", locationDescription: "Yale" },
        region: { group: "Fraser Valley", name: "Lower Mainland" },
        location: { latitude: 49.56, longitude: -121.43 },
        isOn: true,
      }),
    ).toMatchObject({ id: "2", name: "Yale - N", highway: "1", region: "Lower Mainland", lat: 49.56, lon: -121.43, state: "ok" });
  });

  it("refuses an answer that isn't a list of cameras rather than showing none", () => {
    expect(() => parseList({ detail: "Not found" })).toThrow();
    expect(() => parseList([])).toThrow();
    expect(parseList({ results: [site({})] })).toHaveLength(1);
  });

  it("reads the open data CSV by its header, with quoted commas and quotes", () => {
    expect(csvRows('a,"b, c","d ""e"""\n1,2,3')).toEqual([
      ["a", "b, c", 'd "e"'],
      ["1", "2", "3"],
    ]);
    const list = parseCsv(CSV);
    expect(list.map((c) => [c.id, c.name, c.highway, c.region])).toEqual([
      ["520", "Britannia - S", "99", "Lower Mainland"],
      ["939", "Elkford - S", "43", "Southern Interior"],
    ]);
    expect(list[0]).toMatchObject({ caption: "Highway 99 at Copper Drive in Britannia Beach, looking south.", lat: 49.623919 });
  });

  it("finds cameras by name, place or highway, nearest home first", () => {
    const list = parseList(answer);
    expect(findCameras(list, "", langley).map((c) => c.id)).toEqual(["904", "292", "685", "12"]);
    expect(findCameras(list, "port mann", langley)).toEqual([
      { id: "292", name: "Port Mann Bridge - W", caption: "Highway 1 at the Port Mann Bridge, looking west.", highway: "1", km: 17 },
    ]);
    expect(findCameras(list, "Hwy 5", langley).map((c) => c.id)).toEqual(["685"]);
    expect(findCameras(list, "highway 1 surrey", langley).map((c) => c.id)).toEqual(["904"]);
    expect(findCameras(list, "685", langley).map((c) => c.id)).toEqual(["685"]);
  });
});

describe("DriveBC feed and pictures", () => {
  useTestServer({});
  afterEach(() => {
    vi.unstubAllGlobals();
    clearMemoryCache();
    clearDriveBcPictures();
  });

  it("knows only the cameras on widgets, and the widget schema takes numeric ids only", () => {
    expect([...camerasInUse(withCameras(["904", "292"]))]).toEqual(["904", "292"]);
    expect(camerasInUse(defaultConfig()).size).toBe(0);
    const w = newWidget("drivebc", "d", { x: 0, y: 0 });
    expect(widgetSchema.safeParse({ ...w, cameras: [{ id: "904", name: "Hwy 1" }] }).success).toBe(true);
    expect(widgetSchema.safeParse({ ...w, cameras: [{ id: "../x", name: "Bad" }] }).success).toBe(false);
    expect(widgetSchema.safeParse({ ...w, cameras: [1, 2, 3, 4, 5].map((n) => ({ id: String(n), name: "" })) }).success).toBe(false);
  });

  it("gives each widget camera's status, marking a picture DriveBC hasn't replaced in 20 minutes as late", async () => {
    const fetch = vi.fn<(url: string) => Promise<Response>>(() => Promise.resolve(Response.json(answer)));
    vi.stubGlobal("fetch", fetch);
    const now = Date.parse("2026-11-25T23:45:00Z"); // 15 minutes after 904's last picture
    const feed = await driveBcFeed(withCameras(["904", "685", "12", "999"]), now);
    expect(feed.down).toBe(false);
    expect(feed.cameras.map((c) => [c.id, c.state])).toEqual([
      ["904", "ok"],
      ["685", "late"],
      ["12", "off"],
    ]);
    expect((await driveBcFeed(withCameras(["904"]), now + 6 * 60_000)).cameras[0]!.state).toBe("late");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toBe("https://www.drivebc.ca/api/webcams/");
  });

  it("reads nothing without a widget, and says so when DriveBC never answered", async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response("busy", { status: 503 })));
    vi.stubGlobal("fetch", fetch);
    expect(await driveBcFeed(defaultConfig())).toMatchObject({ down: false, cameras: [] });
    expect(fetch).not.toHaveBeenCalled();
    expect(await driveBcFeed(withCameras(["904"]))).toMatchObject({ down: true, cameras: [] });
  });

  it("falls back to the open data CSV for the camera search", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => Promise.resolve(url.includes("api/webcams") ? new Response("down", { status: 500 }) : new Response(CSV))),
    );
    expect((await cameraList()).map((c) => c.id)).toEqual(["520", "939"]);
  });

  it("fetches pictures only of widget cameras, builds the address itself and shares one copy a minute", async () => {
    const fetch = vi.fn<(url: string) => Promise<Response>>(() =>
      Promise.resolve(new Response(JPEG, { headers: { "Content-Type": "image/jpeg" } })),
    );
    vi.stubGlobal("fetch", fetch);
    const config = withCameras(["904"]);
    expect(await driveBcImage(config, "292")).toBeNull();
    expect(await driveBcImage(config, "../904")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    const r = await driveBcImage(config, "904", 1_000);
    expect(r?.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await r!.arrayBuffer())).toEqual(JPEG);
    expect(fetch.mock.calls[0]![0]).toBe("https://www.drivebc.ca/images/904.jpg");
    await driveBcImage(config, "904", 30_000);
    expect(fetch).toHaveBeenCalledTimes(1);

    // DriveBC answering with a page rather than a picture keeps the last good one.
    fetch.mockImplementation(() => Promise.resolve(new Response("<html>", { headers: { "Content-Type": "text/html" } })));
    const later = await driveBcImage(config, "904", 120_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(new Uint8Array(await later!.arrayBuffer())).toEqual(JPEG);
  });

  it("answers displays only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => Promise.resolve(url.endsWith(".jpg") ? new Response(JPEG) : Response.json(answer))),
    );
    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    const c = structuredClone(stored.config);
    c.views[0]!.widgets = withCameras(["292"]).views[0]!.widgets;
    await saveConfig(LEGACY_ACCOUNT_ID, c, stored.version);
    expect((await feedGET(req("/api/display/drivebc/"))).status).toBe(401);
    expect((await imageGET(req("/api/display/drivebc/image/?c=292"))).status).toBe(401);
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const headers = { "x-display-token": token };
    const data = (await (await feedGET(req("/api/display/drivebc/", { headers }))).json()) as DriveBcData;
    expect(data.cameras.map((x) => x.name)).toEqual(["Port Mann Bridge - W"]);
    expect((await imageGET(req("/api/display/drivebc/image/?c=292", { headers }))).status).toBe(200);
    expect((await imageGET(req("/api/display/drivebc/image/?c=904", { headers }))).status).toBe(404);
  });
});
