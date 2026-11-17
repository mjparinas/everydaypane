// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { newWidget } from "@/lib/config/widgets";
import type { DisplayPayload } from "@/lib/display/types";

import { shortTime } from "./format";
import { kindOf, label, weatherIcon } from "./icons";
import { aqhiBand, usAqiBand } from "./widgets/air";
import { clock } from "./widgets/clock";
import { countdown } from "./widgets/countdown";
import { controlFor, stateText } from "./widgets/ha";
import { F, media, nowPlaying, positionNow } from "./widgets/media";

const ctx = { payload: {} as DisplayPayload, timeZone: "America/Vancouver", hour12: true };

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("weather icons", () => {
  it.each([
    [0, "clear"],
    [2, "partly"],
    [3, "cloudy"],
    [45, "fog"],
    [53, "drizzle"],
    [63, "rain"],
    [82, "heavyRain"],
    [67, "freezing"],
    [75, "snow"],
    [86, "snow"],
    [95, "thunder"],
  ])("code %i is %s", (code, kind) => expect(kindOf(code)).toBe(kind));

  it("says sunny by day and clear at night", () => {
    expect(label(0, true)).toBe("Sunny");
    expect(label(0, false)).toBe("Clear");
    expect(weatherIcon(0, false)).toContain("--moon");
  });
});

describe("air quality bands", () => {
  it("follows Health Canada's AQHI bands", () => {
    expect([1, 3, 4, 6, 7, 10, 11].map((v) => aqhiBand(v).level)).toEqual([1, 1, 2, 2, 3, 3, 4]);
  });
  it("follows the EPA's AQI bands", () => {
    expect([50, 51, 100, 101, 151, 201].map((v) => usAqiBand(v).level)).toEqual([1, 2, 2, 3, 4, 5]);
  });
});

describe("formatting", () => {
  it("writes short times", () => {
    expect(shortTime("2026-11-17T14:00", true)).toBe("2 PM");
    expect(shortTime("2026-11-17T00:30", true)).toBe("12:30 AM");
    expect(shortTime("2026-11-17T09:05", false)).toBe("09:05");
  });
});

describe("widgets", () => {
  it("shows the time in the clock's own zone", () => {
    vi.useFakeTimers({ now: new Date("2026-11-17T20:15:30Z") });
    const el = document.createElement("div");
    const w = { ...newWidget("clock", "c", { x: 0, y: 0 }), timeZone: "America/Toronto", label: "Toronto" };
    const stop = clock(el, w, ctx);
    expect(el.querySelector(".c-hm")?.textContent).toBe("3:15");
    expect(el.querySelector(".c-ampm")?.textContent).toBe("PM");
    expect(el.textContent).toContain("Toronto");
    stop();
  });

  it("counts down to the soonest events", () => {
    vi.useFakeTimers({ now: new Date("2026-11-17T20:00:00Z") });
    const el = document.createElement("div");
    const w = {
      ...newWidget("countdown", "cd", { x: 0, y: 0 }),
      count: 2,
      events: [
        { id: "a", name: "Christmas", date: "2026-12-25", emoji: "🎄", kind: "holiday" as const, yearly: true },
        { id: "b", name: "Sam", date: "2015-11-18", emoji: "", kind: "birthday" as const, yearly: true },
        { id: "c", name: "Canada Day", date: "2027-07-01", emoji: "", kind: "holiday" as const, yearly: true },
      ],
    };
    const stop = countdown(el, w, ctx);
    const rows = [...el.querySelectorAll(".cd-row")].map((r) => r.textContent);
    expect(rows).toEqual(["🎂Sam turns 11Tomorrow", "🎄Christmas38 days"]);
    stop();
  });
});

describe("Home Assistant tiles", () => {
  it("picks a control from the entity's domain", () => {
    expect(controlFor("light.kitchen", "auto")).toBe("light");
    expect(controlFor("switch.kettle", "auto")).toBe("toggle");
    expect(controlFor("lock.front", "auto")).toBe("lock");
    expect(controlFor("scene.movie", "auto")).toBe("button");
    expect(controlFor("sensor.outside", "auto")).toBe("sensor");
    expect(controlFor("light.kitchen", "sensor")).toBe("sensor");
  });

  it("says states the way people do", () => {
    const e = (id: string, state: string, extra = {}) => ({ id, state, name: id, changed: 0, ...extra });
    expect(stateText(e("sensor.outside", "7.4567", { unit: "°C" }))).toBe("7.5 °C");
    expect(stateText(e("sensor.humidity", "48", { unit: "%" }))).toBe("48%");
    expect(stateText(e("binary_sensor.garage", "on", { deviceClass: "garage_door" }))).toBe("Open");
    expect(stateText(e("binary_sensor.hall", "off", { deviceClass: "motion" }))).toBe("Clear");
    expect(stateText(e("lock.front", "unlocked"))).toBe("Unlocked");
    expect(stateText(e("light.kitchen", "unavailable"))).toBe("Unavailable");
  });
});

describe("music widget", () => {
  const player = {
    id: "media_player.kitchen",
    state: "playing",
    name: "Kitchen",
    changed: 0,
    media: {
      title: "Here Comes the Sun",
      artist: "The Beatles",
      album: "Abbey Road",
      art: "abc123",
      duration: 185,
      position: 60,
      positionAt: Date.parse("2026-11-17T20:00:00Z"),
      volume: 0.35,
      muted: false,
      source: "Morning mix",
      sources: ["Morning mix", "CBC Radio One"],
      features: F.pause | F.play | F.next | F.previous | F.volumeSet | F.mute | F.source,
    },
  };

  it("moves the track on while playing, and holds it while paused", () => {
    const later = Date.parse("2026-11-17T20:00:30Z");
    expect(positionNow(player, later)).toBe(90);
    expect(positionNow({ ...player, state: "paused" }, later)).toBe(60);
    expect(positionNow(player, Date.parse("2026-11-17T21:00:00Z"))).toBe(185);
  });

  it("says when nothing is playing", () => {
    expect(nowPlaying(player)).toEqual({ title: "Here Comes the Sun", detail: "The Beatles · Abbey Road" });
    expect(nowPlaying({ ...player, state: "idle", media: { features: 0, source: "TV" } })).toEqual({
      title: "Nothing playing",
      detail: "TV",
    });
    expect(nowPlaying({ ...player, state: "unavailable" }).title).toBe("Unavailable");
  });

  it("shows what's playing and sends taps to the server", async () => {
    document.body.dataset.token = "";
    const posts: unknown[] = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit = {}) => {
      if (init.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(Response.json({ updatedAt: 0, configured: true, entities: { [player.id]: player } }));
    });
    const el = document.createElement("div");
    const w = { ...newWidget("media", "m", { x: 0, y: 0 }), entityId: player.id, showSources: true };
    const stop = media(el, w, ctx);
    await vi.waitFor(() => expect(el.querySelector(".mp-title")?.textContent).toBe("Here Comes the Sun"));
    expect(el.querySelector(".mp-detail")?.textContent).toBe("The Beatles · Abbey Road");
    expect(el.querySelector<HTMLImageElement>(".mp-art")?.getAttribute("src")).toBe("/api/display/art/?e=media_player.kitchen&k=abc123");
    expect(el.querySelector<HTMLInputElement>(".mp-volume")?.value).toBe("35");
    const select = el.querySelector<HTMLSelectElement>(".mp-sources");
    expect(select?.value).toBe("Morning mix");

    const play = el.querySelector<HTMLButtonElement>(".mp-play");
    expect(play?.getAttribute("aria-label")).toBe("Pause");
    play?.click();
    expect(play?.getAttribute("aria-label")).toBe("Play");
    el.querySelector<HTMLButtonElement>("[aria-label=Next]")?.click();
    if (select) {
      select.value = "CBC Radio One";
      select.dispatchEvent(new Event("change"));
    }
    await vi.waitFor(() => expect(posts).toHaveLength(3));
    expect(posts).toEqual([
      { entity: player.id, action: "playPause" },
      { entity: player.id, action: "next" },
      { entity: player.id, action: "source", option: "CBC Radio One" },
    ]);
    stop();
    vi.unstubAllGlobals();
  });
});
