// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Widget } from "@/lib/config/schema";
import { newWidget, WIDGETS } from "@/lib/config/widgets";
import type { AirData, ChoresData, DisplayPayload, TasksData, TransitData, TransitDeparture, WeatherData } from "@/lib/display/types";

import { fuzzyTime, shortTime } from "./format";
import { kindOf, label, weatherIcon } from "./icons";
import { airQuality, aqhiBand, usAqiBand } from "./widgets/air";
import { calendarMonth, fitDayTitles } from "./widgets/calendar";
import { bandsFor, chores, columns } from "./widgets/chores";
import { clock } from "./widgets/clock";
import { commute, distance, duration, timing, trafficLevel } from "./widgets/commute";
import { countdown } from "./widgets/countdown";
import { date } from "./widgets/date";
import { earth, RELOAD_MS } from "./widgets/earth";
import { ferries, fullness, hasLeft } from "./widgets/ferries";
import { completesLockHold, controlFor, haEntity, stateText } from "./widgets/ha";
import { meals } from "./widgets/meals";
import { F, media, nowPlaying, positionNow } from "./widgets/media";
import { pickFrames, radar, thin } from "./widgets/radar";
import { describe as describeTeam, opponent, result, score, sports, when } from "./widgets/sports";
import { daylightLength, sunTimes } from "./widgets/sunTimes";
import { dueLabel, shownLists, tasks, UNDO_MS } from "./widgets/tasks";
import { delayLabel, minutesLabel, shownDepartures, transit } from "./widgets/transit";
import { wifiQr } from "./widgets/wifi";
import { windy } from "./widgets/windy";

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
  it("shows today's sunrise, sunset and daylight in the chosen clock format", async () => {
    const data = {
      today: { sunrise: "2026-11-21T07:33", sunset: "2026-11-21T16:24" },
    } as WeatherData;
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json(data)));
    const el = document.createElement("div");
    const stop = sunTimes(el, newWidget("sunTimes", "sun", { x: 0, y: 0 }), ctx);
    await vi.waitFor(() => expect(el.querySelectorAll(".st-value")).toHaveLength(2));
    expect([...el.querySelectorAll(".st-value")].map((node) => node.textContent)).toEqual(["7:33 AM", "4:24 PM"]);
    expect(el.querySelectorAll(".st-icon")).toHaveLength(2);
    expect(el.querySelector(".st-daylight")?.textContent).toBe("☀️ 8 hr 51 min of daylight");
    expect(daylightLength("", "2026-11-21T16:24")).toBe("");
    stop();
    vi.unstubAllGlobals();
  });

  it("hides sunrise and sunset emoji when switched off", async () => {
    const data = {
      today: { sunrise: "2026-11-21T07:33", sunset: "2026-11-21T16:24" },
    } as WeatherData;
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json(data)));
    const el = document.createElement("div");
    const stop = sunTimes(el, { ...newWidget("sunTimes", "sun", { x: 0, y: 0 }), showEmoji: false }, ctx);
    await vi.waitFor(() => expect(el.querySelector(".st-daylight")).toBeTruthy());
    expect(el.querySelector(".st-icon")).toBeNull();
    expect(el.querySelector(".st-daylight")?.textContent).toBe("8 hr 51 min of daylight");
    stop();
    vi.unstubAllGlobals();
  });

  it("hides hours of daylight when switched off", async () => {
    const data = {
      today: { sunrise: "2026-11-21T07:33", sunset: "2026-11-21T16:24" },
    } as WeatherData;
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json(data)));
    const el = document.createElement("div");
    const stop = sunTimes(el, { ...newWidget("sunTimes", "sun", { x: 0, y: 0 }), showDaylight: false }, ctx);
    await vi.waitFor(() => expect(el.querySelectorAll(".st-value")).toHaveLength(2));
    expect(el.querySelector(".st-daylight")).toBeNull();
    stop();
    vi.unstubAllGlobals();
  });

  it("shows a custom title on widgets that support one", async () => {
    const weather = {
      today: { sunrise: "2026-11-21T07:33", sunset: "2026-11-21T16:24" },
    } as WeatherData;
    const air = { updatedAt: 1, aqhi: 2, usAqi: 40, pm25: 5 } satisfies AirData;
    vi.stubGlobal("fetch", (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/air")) return Promise.resolve(Response.json(air));
      return Promise.resolve(Response.json(weather));
    });

    const sun = document.createElement("div");
    const stopSun = sunTimes(sun, { ...newWidget("sunTimes", "sun", { x: 0, y: 0 }), title: "Daylight" }, ctx);
    await vi.waitFor(() => expect(sun.querySelector(".w-label")?.textContent).toBe("Daylight"));
    stopSun();

    const airEl = document.createElement("div");
    const stopAir = airQuality(airEl, { ...newWidget("airQuality", "aq", { x: 0, y: 0 }), title: "Outside air" }, ctx);
    await vi.waitFor(() => expect(airEl.querySelector(".w-label")?.textContent).toBe("Outside air"));
    stopAir();

    const day = document.createElement("div");
    const stopDate = date(day, { ...newWidget("date", "d", { x: 0, y: 0 }), title: "Today" }, ctx);
    expect(day.querySelector(".w-label")?.textContent).toBe("Today");
    stopDate();

    const wifi = document.createElement("div");
    const stopWifi = wifiQr(wifi, { ...newWidget("wifiQr", "w", { x: 0, y: 0 }), title: "Guest Wi-Fi", ssid: "pane" }, ctx);
    expect(wifi.querySelector(".w-label")?.textContent).toBe("Guest Wi-Fi");
    stopWifi();

    expect(["clock", "photos", "radar", "earth", "windy"].every((t) => WIDGETS[t as keyof typeof WIDGETS].supportsTitle === false)).toBe(
      true,
    );
    expect(WIDGETS.weather.supportsTitle).not.toBe(false);
    expect(
      ["photos", "radar", "camera", "earth", "windy", "tradingView", "youtube", "vimeo", "instagram", "maps", "whiteboard"].every(
        (t) => WIDGETS[t as keyof typeof WIDGETS].supportsFontScale === false,
      ),
    ).toBe(true);
    expect(WIDGETS.weather.supportsFontScale).not.toBe(false);

    vi.unstubAllGlobals();
  });

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

  it("speaks fuzzy word-clock times", () => {
    expect(fuzzyTime(15, 0)).toBe("three o'clock");
    expect(fuzzyTime(15, 30)).toBe("half past three");
    expect(fuzzyTime(15, 17)).toBe("quarter past three");
    expect(fuzzyTime(15, 45)).toBe("quarter to four");
    expect(fuzzyTime(15, 50)).toBe("ten to four");
  });

  it("draws flip cards and a word line for those styles", () => {
    vi.useFakeTimers({ now: new Date("2026-11-17T20:15:30Z") });
    const flipEl = document.createElement("div");
    const wordEl = document.createElement("div");
    const flip = clock(flipEl, { ...newWidget("clock", "f", { x: 0, y: 0 }), style: "flip", timeZone: "America/Toronto" }, ctx);
    const word = clock(wordEl, { ...newWidget("clock", "w", { x: 0, y: 0 }), style: "word", timeZone: "America/Toronto" }, ctx);
    expect(flipEl.querySelectorAll(".c-flip-d").length).toBe(4);
    expect(wordEl.querySelector(".c-word")?.textContent).toBe("quarter past three");
    flip();
    word();
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

describe("meals", () => {
  const plan = {
    today: "2026-11-17",
    meals: {
      "2026-11-17": { breakfast: "Oatmeal", lunch: "Leftover soup", dinner: "Tacos" },
      "2026-11-18": { breakfast: "Pancakes" },
    },
  };
  const mount = async (now: string, change: Partial<ReturnType<typeof newWidget<"meals">>> = {}) => {
    vi.useFakeTimers({ now: new Date(now) });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json(plan))),
    );
    const el = document.createElement("div");
    const stop = meals(el, { ...newWidget("meals", "ml", { x: 0, y: 0 }), ...change }, ctx);
    await vi.advanceTimersByTimeAsync(0);
    return { el, stop };
  };
  const rows = (el: HTMLElement) =>
    [...el.querySelectorAll(".ml-row")].map((r) => `${r.className.includes("ml-next") ? "> " : ""}${r.textContent}`);

  afterEach(() => vi.unstubAllGlobals());

  it("shows today's meals with the next one highlighted", async () => {
    const { el, stop } = await mount("2026-11-17T20:00:00Z"); // lunchtime in Langley
    expect(el.querySelector(".w-label")?.textContent).toBe("Today's meals");
    expect(rows(el)).toEqual(["🥣 BreakfastOatmeal", "> 🥪 LunchLeftover soup", "🍽️ DinnerTacos"]);
    stop();
  });

  it("moves to tomorrow in the evening, and says when a meal isn't planned", async () => {
    const { el, stop } = await mount("2026-11-18T04:30:00Z"); // 8:30 PM or later on the 17th
    expect(el.querySelector(".w-label")?.textContent).toBe("Tomorrow's meals");
    expect(rows(el)).toEqual(["> 🥣 BreakfastPancakes", "🥪 LunchNot planned", "🍽️ DinnerNot planned"]);
    stop();
  });

  it("lists the days ahead with only the chosen meals", async () => {
    const { el, stop } = await mount("2026-11-17T16:00:00Z", { days: 3, slots: ["dinner"] });
    const days = [...el.querySelectorAll(".ml-day")].map((d) => d.textContent);
    expect(days).toEqual(["Today🍽️ DinnerTacos", "TomorrowNothing planned", "Thu, Nov 19Nothing planned"]);
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

  it("draws a light as a keyboard-reachable switch, with brightness outside the button", async () => {
    document.body.dataset.token = "";
    const posts: unknown[] = [];
    const entity = {
      id: "light.kitchen",
      state: "on",
      name: "Kitchen lights",
      changed: 0,
      brightness: 128,
    };
    vi.stubGlobal("fetch", (url: string, init: RequestInit = {}) => {
      if (init.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(Response.json({ updatedAt: 0, configured: true, entities: { [entity.id]: entity } }));
    });
    const el = document.createElement("div");
    document.body.append(el);
    const w = { ...newWidget("haEntity", "ha1", { x: 0, y: 0 }), entityId: entity.id, control: "light" as const };
    const stop = haEntity(el, w, ctx);
    await vi.waitFor(() => expect(el.querySelector('[role="switch"]')).toBeTruthy());
    const sw = el.querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(sw.tagName).toBe("BUTTON");
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(sw.getAttribute("aria-label")).toBe("Kitchen lights");
    expect(el.querySelector(".ha-range")).toBeTruthy();
    expect(sw.contains(el.querySelector(".ha-range"))).toBe(false);
    sw.click();
    await vi.waitFor(() => expect(posts).toEqual([{ entity: "light.kitchen", action: "toggle" }]));
    stop();
    vi.unstubAllGlobals();
  });

  it("locks only after a deliberate hold", () => {
    expect(completesLockHold(100, 800)).toBe(true);
    expect(completesLockHold(100, 798)).toBe(false);
    expect(completesLockHold(null, 1000)).toBe(false);
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

describe("music widget with Spotify or Sonos signed in directly", () => {
  const spotify = {
    id: "spotify",
    state: "playing",
    name: "Kitchen",
    changed: 0,
    media: {
      title: "Song",
      artist: "Band",
      art: "0123456789abcdef",
      sources: ["Kitchen", "Car"],
      source: "Kitchen",
      features: F.pause | F.next | F.source,
    },
  };

  it("uses the music feed and its own player keys", async () => {
    document.body.dataset.token = "";
    const posts: unknown[] = [];
    const gets: string[] = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit = {}) => {
      if (init.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return Promise.resolve(Response.json({ error: "Controlling Spotify needs Premium" }, { status: 502 }));
      }
      gets.push(url);
      return Promise.resolve(Response.json({ updatedAt: 0, services: { spotify: { connected: true } }, players: { spotify } }));
    });
    const el = document.createElement("div");
    const w = { ...newWidget("media", "m", { x: 0, y: 0 }), provider: "spotify" as const, showSources: true };
    const stop = media(el, w, ctx);
    await vi.waitFor(() => expect(el.querySelector(".mp-title")?.textContent).toBe("Song"));
    expect(gets[0]).toBe("/api/display/music/");
    expect(el.querySelector<HTMLImageElement>(".mp-art")?.getAttribute("src")).toBe("/api/display/art/?p=spotify&k=0123456789abcdef");
    expect(el.querySelector(".mp-sources")?.getAttribute("aria-label")).toBe("Play on");
    el.querySelector<HTMLButtonElement>("[aria-label=Next]")?.click();
    await vi.waitFor(() => expect(el.querySelector(".ha-msg")?.textContent).toBe("Controlling Spotify needs Premium"));
    expect(posts).toEqual([{ player: "spotify", action: "next" }]);
    stop();
    vi.unstubAllGlobals();
  });

  it("asks for Sonos to be connected, or a speaker to be picked", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ updatedAt: 0, services: { sonos: { connected: false } }, players: {} })));
    const el = document.createElement("div");
    const base = { ...newWidget("media", "m", { x: 0, y: 0 }), provider: "sonos" as const };
    const stop = media(el, { ...base, playerId: "RINCON_A" }, ctx);
    await vi.waitFor(() => expect(el.querySelector(".w-empty:not([hidden])")?.textContent).toBe("Connect Sonos under Settings."));
    stop();
    const none = document.createElement("div");
    media(none, base, ctx)();
    expect(none.textContent).toBe("Pick a Sonos or Spotify player for this widget.");
    vi.unstubAllGlobals();
  });
});

describe("tasks", () => {
  const data: TasksData = {
    updatedAt: 1,
    google: {
      connected: true,
      lists: [
        {
          id: "groceries",
          name: "Groceries",
          tasks: [
            { id: "t1", title: "Milk", due: "2026-11-16" },
            { id: "t2", title: "Bread" },
          ],
        },
        { id: "chores", name: "Chores", tasks: [{ id: "t3", title: "Feed the cat", due: "2026-11-18" }] },
      ],
    },
    microsoft: { connected: false, lists: [] },
    todoist: { connected: false, lists: [] },
  };

  it("labels due dates", () => {
    expect(dueLabel("2026-11-17", "2026-11-17")).toEqual({ text: "Today", overdue: false });
    expect(dueLabel("2026-11-18", "2026-11-17")).toEqual({ text: "Tomorrow", overdue: false });
    expect(dueLabel("2026-11-16", "2026-11-17")).toEqual({ text: "Yesterday", overdue: true });
    expect(dueLabel("2026-11-01", "2026-11-17")).toEqual({ text: "Overdue", overdue: true });
  });

  it("shows the picked lists, up to the count in all", () => {
    expect(shownLists(data, "google", [], 2).map((l) => l.tasks.length)).toEqual([2, 0]);
    expect(shownLists(data, "google", ["chores"], 5).map((l) => l.name)).toEqual(["Chores"]);
  });

  it("ticks a task off after the undo time, and a second tap undoes it", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-17T20:00:00Z") });
    const posts: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          posts.push(JSON.parse(String(init.body)));
          return Promise.resolve(Response.json({ ok: true }));
        }
        return Promise.resolve(Response.json(data));
      }),
    );
    const el = document.createElement("div");
    const stop = tasks(el, newWidget("tasks", "tk", { x: 0, y: 0 }), ctx);
    await vi.advanceTimersByTimeAsync(0);
    expect([...el.querySelectorAll(".tk-title")].map((t) => t.textContent)).toEqual(["Milk", "Bread", "Feed the cat"]);
    expect(el.querySelector(".tk-overdue")?.textContent).toBe("Yesterday");

    const button = (title: string) =>
      [...el.querySelectorAll<HTMLButtonElement>(".tk-btn")].find((b) => b.textContent?.includes(title)) as HTMLButtonElement;
    button("Milk").click();
    expect(el.querySelector(".tk-done")?.textContent).toContain("Milk");
    button("Milk").click();
    await vi.advanceTimersByTimeAsync(UNDO_MS + 100);
    expect(posts).toEqual([]);

    button("Bread").click();
    await vi.advanceTimersByTimeAsync(UNDO_MS + 100);
    expect(posts).toEqual([{ provider: "google", list: "groceries", task: "t2" }]);
    expect([...el.querySelectorAll(".tk-title")].map((t) => t.textContent)).toEqual(["Milk", "Feed the cat"]);
    stop();
    vi.unstubAllGlobals();
  });
});

describe("month calendar", () => {
  type Month = Extract<Widget, { type: "calendarMonth" }>;
  const month = async (settings: Partial<Month>, events: unknown[] = []) => {
    vi.useFakeTimers({ now: new Date("2026-11-17T20:00:00Z") });
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ connected: true, updatedAt: 1, events })));
    const el = document.createElement("div");
    const stop = calendarMonth(el, { ...(newWidget("calendarMonth", "mo", { x: 0, y: 0 }) as Month), ...settings }, ctx);
    await vi.advanceTimersByTimeAsync(0);
    const root = el.querySelector(".w-month");
    const title = el.querySelector(".mo-title")?.textContent ?? null;
    const days = [...el.querySelectorAll(".mo-num")].map((n) => n.textContent);
    const names = [...el.querySelectorAll(".mo-name")].map((n) => n.textContent);
    const daysEl = el.querySelector<HTMLElement>(".mo-days");
    const rows = daysEl?.style.gridTemplateRows;
    const scroll = daysEl?.classList.contains("mo-scroll") ?? false;
    const fit = root?.classList.contains("mo-fit") ?? false;
    const titles = [...el.querySelectorAll(".mo-ev")].map((e) => e.textContent);
    stop();
    vi.unstubAllGlobals();
    return { title, days, names, rows, scroll, fit, titles };
  };

  it("shows the whole month with its title by default", async () => {
    const m = await month({});
    expect(m.title).toBe("November 2026");
    expect(m.days).toHaveLength(35);
    expect(m.names).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    expect(m.fit).toBe(true);
    expect(m.scroll).toBe(true);
    // Browsers may simplify the calc; what matters is fixed-height rows (not 1fr) so the grid can scroll.
    expect(m.rows).toMatch(/^repeat\(5,/);
    expect(m.rows).not.toMatch(/1fr/);
  });

  it("leaves the title out when it is switched off, keeping the grid", async () => {
    const m = await month({ showTitle: false });
    expect(m.title).toBeNull();
    expect(m.days).toHaveLength(35);
  });

  it("shows one week, starting on the chosen day", async () => {
    expect((await month({ weeks: 1 })).days).toEqual(["15", "16", "17", "18", "19", "20", "21"]);
    expect((await month({ weeks: 1, weekStartsOn: 1 })).days).toEqual(["16", "17", "18", "19", "20", "21", "22"]);
  });

  it("runs six weeks into the next month and names both months", async () => {
    const m = await month({ weeks: 6 });
    expect(m.days).toHaveLength(42);
    expect(m.rows).toMatch(/^repeat\(6,/);
    expect(m.scroll).toBe(true);
    expect(m.days.slice(16, 18)).toEqual(["Dec 1", "2"]);
    expect(m.title).toBe("November – December 2026");
  });

  it("fills the tile without scrolling when there are at most scrollWeeks rows", async () => {
    const m = await month({ weeks: 2, scrollWeeks: 3 });
    expect(m.scroll).toBe(false);
    expect(m.rows).toMatch(/^repeat\(2,/);
    expect(m.rows).toMatch(/1fr/);
  });

  it("can turn fit titles off", async () => {
    const m = await month({ fitTitles: false });
    expect(m.fit).toBe(false);
  });

  it("keeps the full event title in the DOM when fitting titles", async () => {
    const long = "Orthodontist appointment for both kids after school pickup";
    const m = await month({ weeks: 1 }, [
      {
        id: "e1",
        title: long,
        start: "2026-11-17T15:00:00-08:00",
        end: "2026-11-17T16:00:00-08:00",
        allDay: false,
        color: "#3b82f6",
        calendar: "family",
      },
    ]);
    expect(m.fit).toBe(true);
    expect(m.titles.some((t) => t?.includes(long))).toBe(true);
  });

  it("hides Saturday and Sunday when weekends are off", async () => {
    const m = await month({ weeks: 2, showWeekends: false, weekStartsOn: 1 });
    expect(m.names).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    expect(m.days).toEqual(["16", "17", "18", "19", "20", "23", "24", "25", "26", "27"]);
  });

  it("shrinks an overflowing event title until it fits", () => {
    const day = document.createElement("div");
    const ev = document.createElement("div");
    ev.className = "mo-ev";
    ev.textContent = "A very long calendar title that needs to shrink";
    day.append(ev);
    vi.spyOn(window, "getComputedStyle").mockReturnValue({ fontSize: "16px" } as CSSStyleDeclaration);
    Object.defineProperty(ev, "clientWidth", { configurable: true, get: () => 40 });
    Object.defineProperty(ev, "clientHeight", { configurable: true, get: () => 20 });
    Object.defineProperty(ev, "scrollHeight", { configurable: true, get: () => 20 });
    // Pretend the title only fits once the font has been stepped down far enough.
    Object.defineProperty(ev, "scrollWidth", {
      configurable: true,
      get: () => ((parseFloat(ev.style.fontSize) || 16) <= 10 ? 40 : 100),
    });
    fitDayTitles(day);
    expect(parseFloat(ev.style.fontSize)).toBe(10);
  });
});

describe("commute", () => {
  const work = {
    id: "work",
    name: "Work",
    emoji: "🏢",
    arriveBy: "",
    seconds: 2460,
    freeFlowSeconds: 1920,
    delaySeconds: 540,
    meters: 38_200,
  };

  it("writes drive times the way people say them", () => {
    expect(duration(20)).toBe("1 min");
    expect(duration(2460)).toBe("41 min");
    expect(duration(3600)).toBe("1 h");
    expect(duration(4500)).toBe("1 h 15 min");
    expect(distance(38_200, "metric")).toBe("38 km");
    expect(distance(8_000, "imperial")).toBe("5.0 mi");
  });

  it("colours a drive by how much traffic adds to it", () => {
    expect(trafficLevel({ seconds: 1900, freeFlowSeconds: 1800, delaySeconds: 100 })).toBe(1);
    expect(trafficLevel({ seconds: 600, freeFlowSeconds: 420, delaySeconds: 170 })).toBe(1); // under three minutes
    expect(trafficLevel({ seconds: 2460, freeFlowSeconds: 1920, delaySeconds: 540 })).toBe(2);
    expect(trafficLevel({ seconds: 3000, freeFlowSeconds: 1920, delaySeconds: 1080 })).toBe(3);
  });

  it("says when to leave before a be-there-by time, and when you'd arrive otherwise", () => {
    const school = { ...work, arriveBy: "08:30", seconds: 900 };
    expect(timing(school, "07:40", true, true)).toBe("Leave by 8:15 AM");
    expect(timing(school, "08:20", true, true)).toBe("Leave now");
    expect(timing(school, "04:00", true, true)).toBe("Arrive 4:15 AM"); // more than three hours ahead
    expect(timing(school, "09:00", false, true)).toBe("Arrive 09:15");
    expect(timing(work, "23:30", true, true)).toBe("Arrive 12:11 AM");
    expect(timing(work, "07:40", true, false)).toBe("");
  });

  it("draws the picked places, and doesn't pass off old traffic as live", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-19T14:40:00Z") }); // 7:40 AM in Vancouver (UTC−7 all year from 2026)
    const now = Date.now();
    const routes = [
      { ...work, at: now - 60_000 },
      {
        id: "gym",
        name: "Gym",
        emoji: "",
        arriveBy: "",
        seconds: 600,
        freeFlowSeconds: 600,
        delaySeconds: 0,
        meters: 4000,
        at: now - 3_600_000,
      },
      { id: "school", name: "School", emoji: "", arriveBy: "08:30", seconds: 900, freeFlowSeconds: 900, delaySeconds: 0, at: now },
    ];
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ updatedAt: now, missing: "", routes })));
    const el = document.createElement("div");
    const w = { ...newWidget("commute", "cm", { x: 0, y: 0 }), destinationIds: ["work", "gym"] };
    const stop = commute(el, w, ctx);
    await vi.advanceTimersByTimeAsync(0);
    const rows = [...el.querySelectorAll(".cm-row")];
    expect(rows.map((r) => r.className)).toEqual(["cm-row cm-2", "cm-row cm-0"]);
    expect(rows.map((r) => r.textContent)).toEqual(["🏢 Work41 min+9 min traffic · Arrive 8:21 AM", "Gym–No traffic info right now"]);
    stop();
    vi.unstubAllGlobals();
  });

  it("says what to set up when nothing is", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-19T15:40:00Z") });
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ updatedAt: 1, missing: "key", routes: [] })));
    const el = document.createElement("div");
    const stop = commute(el, { ...newWidget("commute", "cm2", { x: 0, y: 0 }) }, ctx);
    await vi.advanceTimersByTimeAsync(0);
    expect(el.textContent).toBe("Add a TomTom key to show commute times.");
    stop();
    vi.unstubAllGlobals();
  });
});

describe("radar", () => {
  const at = (hhmm: string) => Date.parse(`2026-11-21T${hhmm}:00Z`);
  const every = (from: string, to: string, minutes: number) => {
    const out: number[] = [];
    for (let t = at(from); t <= at(to); t += minutes * 60_000) out.push(t);
    return out;
  };
  const times = { past: every("02:06", "05:00", 6), forecast: every("05:10", "08:00", 10) };

  it("thins a long list evenly and keeps the latest", () => {
    expect(thin([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([1, 4, 7]);
    expect(thin([1, 2], 5)).toEqual([1, 2]);
  });

  it("plays the past hour into the next hour's forecast, at most sixteen pictures", () => {
    const frames = pickFrames(times, 60, 60, true);
    expect(frames.filter((f) => !f.forecast).map((f) => f.time)).toEqual(every("04:00", "05:00", 6).slice(1));
    expect(frames.filter((f) => f.forecast).map((f) => f.time)).toEqual(every("05:10", "06:00", 10));
    expect(pickFrames(times, 180, 180, true)).toHaveLength(16);
    expect(pickFrames(times, 180, 0, true).every((f) => !f.forecast)).toBe(true);
  });

  it("shows only the latest picture when it doesn't animate", () => {
    expect(pickFrames(times, 60, 60, false)).toEqual([{ time: at("05:00"), forecast: false }]);
    expect(pickFrames({ past: [], forecast: [] }, 60, 60, true)).toEqual([]);
  });

  it("lays the radar over the map around home and loops into the forecast", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-21T05:03:00Z") });
    const loaded = vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(640);
    const complete = vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    const data = { updatedAt: 1, maps: { "8": { x: 38, y: 85, homeX: 710, homeY: 718 } }, layers: { rain: times } };
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json(data)));
    const el = document.createElement("div");
    document.body.append(el);
    const stop = radar(el, { ...newWidget("radar", "rd", { x: 0, y: 0 }), forecastMinutes: 30 }, ctx);
    await vi.advanceTimersByTimeAsync(0);
    const tiles = [...el.querySelectorAll<HTMLImageElement>(".rd-tile")].map((i) => new URL(i.src, "http://x").search);
    expect(tiles).toHaveLength(50);
    expect(tiles[0]).toBe("?s=light&z=8&x=38&y=85");
    expect(tiles[49]).toBe("?s=light-labels&z=8&x=42&y=89");
    expect(el.querySelector<HTMLElement>(".rd-home")?.style.left).toBe("710px");
    expect(el.querySelectorAll(".rd-frame")).toHaveLength(13); // ten observed, three forecast
    expect(el.querySelector(".rd-when")?.textContent).toBe("10 PMLatest"); // 05:00 UTC is 10 PM in Vancouver
    await vi.advanceTimersByTimeAsync(2000);
    expect(el.querySelector(".rd-when")?.textContent).toBe("10:10 PMForecast");
    await vi.advanceTimersByTimeAsync(1000);
    expect(el.querySelector(".rd-when")?.textContent).toBe("10:30 PMForecast");
    expect(el.querySelectorAll(".rd-frame.on")).toHaveLength(1);
    document.documentElement.dataset.mode = "night";
    await vi.advanceTimersByTimeAsync(2000);
    expect(el.querySelector<HTMLImageElement>(".rd-tile")?.src).toContain("s=dark&");
    expect(el.querySelector(".rd-when")?.textContent).toBe("9:06 PM"); // back to the start of the loop
    delete document.documentElement.dataset.mode;
    stop();
    loaded.mockRestore();
    complete.mockRestore();
    vi.unstubAllGlobals();
  });

  it("says when the radar is unavailable", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-21T05:03:00Z") });
    const data = {
      updatedAt: 1,
      maps: { "8": { x: 38, y: 85, homeX: 710, homeY: 718 } },
      layers: { rain: { past: [], forecast: [], error: "x" } },
    };
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json(data)));
    const el = document.createElement("div");
    const stop = radar(el, newWidget("radar", "rd2", { x: 0, y: 0 }), ctx);
    await vi.advanceTimersByTimeAsync(0);
    expect(el.textContent).toBe("The radar is unavailable right now.");
    stop();
    vi.unstubAllGlobals();
  });
});

describe("ferries", () => {
  it("drops a sailing five minutes after it was due, and never takes tonight's last one for this morning's", () => {
    expect(hasLeft({ time: "09:00" }, "09:05")).toBe(false);
    expect(hasLeft({ time: "09:00" }, "09:06")).toBe(true);
    expect(hasLeft({ time: "09:00", delayMinutes: 25 }, "09:20")).toBe(false);
    expect(hasLeft({ time: "00:30" }, "23:10")).toBe(false); // after midnight: tomorrow's
    expect(hasLeft({ time: "23:00" }, "00:10")).toBe(true);
  });

  it("turns the bar amber from 70 % and red from 90 %", () => {
    expect(fullness(41)).toEqual({ text: "41% full", level: 1 });
    expect(fullness(70)).toEqual({ text: "70% full", level: 2 });
    expect(fullness(92)).toEqual({ text: "92% full", level: 3 });
    expect(fullness(100)).toEqual({ text: "Full", level: 3 });
  });

  it("draws the next sailings of each picked route, in the widget's order", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-21T16:10:00Z") }); // 9:10 AM in Vancouver
    const now = Date.now();
    const base = { arrive: "", vessel: "Coastal Celebration", note: "" };
    const routes = [
      { code: "HSBNAN", name: "Horseshoe Bay → Departure Bay", duration: "1h 40m", status: "no-service", sailings: [] },
      {
        code: "TSASWB",
        name: "Tsawwassen → Swartz Bay",
        duration: "1h 35m",
        status: "",
        sailings: [
          { ...base, time: "09:00", state: "scheduled", fill: 92 }, // left ten minutes ago
          { ...base, time: "11:00", state: "scheduled", fill: 41 },
          { ...base, time: "13:00", state: "cancelled" },
          { ...base, time: "15:00", state: "delayed", delayMinutes: 25, fill: 100 },
          { ...base, time: "17:00", state: "scheduled", fill: 10 },
        ],
      },
    ];
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ updatedAt: now, at: now - 60_000, down: false, routes })));
    const el = document.createElement("div");
    const w = { ...newWidget("ferries", "fe", { x: 0, y: 0 }), routes: ["TSASWB" as const, "HSBNAN" as const], count: 3 };
    const stop = ferries(el, w, ctx);
    await vi.advanceTimersByTimeAsync(0);
    const names = [...el.querySelectorAll(".fe-name")].map((n) => n.textContent);
    expect(names).toEqual(["Tsawwassen → Swartz Bay1h 35m", "Horseshoe Bay → Departure Bay1h 40m"]);
    const rows = [...el.querySelectorAll(".fe-row")];
    expect(rows.map((r) => r.className)).toEqual(["fe-row fe-scheduled", "fe-row fe-cancelled", "fe-row fe-delayed"]);
    expect(rows.map((r) => r.textContent)).toEqual(["11 AM41% full", "1 PMCancelled", "3 PMFullDelayed 25 min"]);
    expect(el.querySelector(".fe-none")?.textContent).toBe("No service today");
    expect(el.querySelector(".fe-asof")).toBeNull();
    stop();
    vi.unstubAllGlobals();
  });

  it("says when BC Ferries can't be read", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-21T16:10:00Z") });
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ updatedAt: 1, at: 0, down: true, routes: [] })));
    const el = document.createElement("div");
    const stop = ferries(el, newWidget("ferries", "fe2", { x: 0, y: 0 }), ctx);
    await vi.advanceTimersByTimeAsync(0);
    expect(el.textContent).toBe("BC Ferries sailings are unavailable right now.");
    stop();
    vi.unstubAllGlobals();
  });
});

describe("chore chart", () => {
  const data: ChoresData = {
    today: "2026-11-18",
    pinSet: false,
    rewards: [],
    people: [
      { id: "ana", name: "Ana", emoji: "🦊", color: "#e8590c", goal: 10, stars: 4, available: 4 },
      { id: "ben", name: "Ben", emoji: "", color: "#1c7ed6", goal: 0, stars: 0, available: 0 },
    ],
    chores: [
      { id: "bed", name: "Make the bed", emoji: "🛏️", stars: 1, period: "morning" },
      { id: "dishes", name: "Dishes", emoji: "", stars: 3, period: "evening" },
    ],
    due: [
      { choreId: "bed", personId: "ana", done: true },
      { choreId: "bed", personId: "ben", done: false },
      { choreId: "dishes", personId: "ana", done: false },
    ],
  };

  it("makes a column per person, and counts a tick not yet saved towards the stars", () => {
    expect(columns(data, []).map((c) => [c.person.name, c.items.map((i) => i.chore.id)])).toEqual([
      ["Ana", ["bed", "dishes"]],
      ["Ben", ["bed"]],
    ]);
    expect(columns(data, ["ben"]).map((c) => c.person.id)).toEqual(["ben"]);
    const ticked = columns(data, [], new Map([["dishes|ana", true]]));
    expect(ticked[0]?.person.stars).toBe(7);
    expect(columns(data, [], new Map([["bed|ana", false]]))[0]?.person.stars).toBe(3);
  });

  it("groups a kid's chores into morning/afternoon/evening bands", () => {
    const ana = columns(data, ["ana"])[0]!.items;
    expect(bandsFor(ana).map((b) => [b.period, b.items.map((i) => i.chore.id)])).toEqual([
      ["morning", ["bed"]],
      ["evening", ["dishes"]],
    ]);
  });

  it("draws time-of-day bands and completion dots when layout is byPeriod", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-18T19:00:00Z") });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json(data))),
    );
    const el = document.createElement("div");
    const widget = { ...newWidget("chores", "ch", { x: 0, y: 0 }), layout: "byPeriod" as const };
    const stop = chores(el, widget, ctx);
    await vi.advanceTimersByTimeAsync(0);
    expect([...el.querySelectorAll(".ch-band-label")].map((n) => n.textContent)).toEqual(expect.arrayContaining(["Morning", "Evening"]));
    expect(el.querySelectorAll(".ch-dot").length).toBeGreaterThan(0);
    stop();
    vi.unstubAllGlobals();
  });

  it("ticks a chore off at once, says so when everyone's done, and a second tap takes it back", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-18T19:00:00Z") });
    const posts: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          posts.push(JSON.parse(String(init.body)));
          return Promise.resolve(Response.json({ ok: true }));
        }
        return Promise.resolve(Response.json(data));
      }),
    );
    const el = document.createElement("div");
    const stop = chores(el, newWidget("chores", "ch", { x: 0, y: 0 }), ctx);
    await vi.advanceTimersByTimeAsync(0);
    expect([...el.querySelectorAll(".ch-name")].map((n) => n.textContent)).toEqual(["Ana", "Ben"]);
    expect(el.querySelector(".ch-stars")?.textContent).toBe("⭐ 4 / 10");

    const button = (key: string) => el.querySelector<HTMLButtonElement>(`[data-key="${key}"] button`) as HTMLButtonElement;
    button("dishes|ana").click();
    expect(el.querySelector(".ch-stars")?.textContent).toBe("⭐ 7 / 10");
    expect(el.querySelector(".ch-finished .ch-all")?.textContent).toBe("All done! 🎉");
    expect(el.querySelector(".ch-pop")?.textContent).toBe("+3 ⭐");
    button("dishes|ana").click();
    expect(el.querySelector(".ch-stars")?.textContent).toBe("⭐ 4 / 10");
    expect(el.querySelector(".ch-finished")).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(posts).toEqual([
      { chore: "dishes", person: "ana", done: true },
      { chore: "dishes", person: "ana", done: false },
    ]);
    stop();
    vi.unstubAllGlobals();
  });

  it("asks for setup when there's nobody on the chart", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json({ ...data, people: [], due: [] }))),
    );
    const el = document.createElement("div");
    const stop = chores(el, newWidget("chores", "ch", { x: 0, y: 0 }), ctx);
    await vi.waitFor(() => expect(el.textContent).toContain("Settings › Chores"));
    stop();
    vi.unstubAllGlobals();
  });
});

describe("TransLink departures", () => {
  const NOW = 1_795_000_000;
  const dep = (route: string, inMin: number, delay: number | null = 0, live = true): TransitDeparture => ({
    route,
    headsign: route === "502" ? "Langley Centre" : "Aldergrove",
    time: NOW + inMin * 60,
    delay,
    live,
  });

  it("labels minutes to go and how late a bus is", () => {
    expect(minutesLabel(NOW + 30, NOW, "3:07")).toBe("Now");
    expect(minutesLabel(NOW + 4 * 60 + 59, NOW, "3:10")).toBe("4 min");
    expect(minutesLabel(NOW + 75 * 60, NOW, "4:21")).toBe("4:21");
    expect(delayLabel(dep("502", 5, 180))).toEqual({ text: "3 min late", cls: "tl-late" });
    expect(delayLabel(dep("502", 5, -120))).toEqual({ text: "2 min early", cls: "tl-early" });
    expect(delayLabel(dep("502", 5, 20))).toEqual({ text: "On time", cls: "tl-ontime" });
    expect(delayLabel(dep("502", 5, null, false))).toEqual({ text: "Scheduled", cls: "" });
  });

  it("keeps the widget's routes, drops buses too soon to walk to, and cuts to the count", () => {
    const list = [dep("502", 2), dep("503", 6), dep("502", 9), dep("502", 20), dep("502", 30)];
    expect(shownDepartures(list, { routes: [], count: 3, walkMinutes: 0 }, NOW).map((d) => d.time - NOW)).toEqual([120, 360, 540]);
    expect(shownDepartures(list, { routes: ["502"], count: 2, walkMinutes: 5 }, NOW).map((d) => d.time - NOW)).toEqual([540, 1200]);
  });

  it("draws each stop's next buses from the shared feed", async () => {
    vi.useFakeTimers({ now: NOW * 1000, toFake: ["Date"] });
    const data: TransitData = { updatedAt: 0, configured: true, stops: { "100": [dep("502", 4, 180), dep("503", 12, null, false)] } };
    const gets: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      gets.push(url);
      return Promise.resolve(Response.json(data));
    });
    const el = document.createElement("div");
    const w = { ...newWidget("transit", "t", { x: 0, y: 0 }), stops: [{ id: "100", code: "55210", name: "Fraser Hwy @ 200 St" }] };
    const stop = transit(el, w, ctx);
    await vi.waitFor(() => expect(el.querySelectorAll(".tl-row")).toHaveLength(2));
    expect(gets[0]).toBe("/api/display/transit/");
    expect(el.querySelector(".tl-name")?.textContent).toBe("Fraser Hwy @ 200 St #55210");
    const rows = [...el.querySelectorAll(".tl-row")].map((r) => r.textContent);
    expect(rows).toEqual(["502Langley Centre4:10 a.m. · 3 min late4 min", "503Aldergrove4:18 a.m. · Scheduled12 min"]);
    expect(el.textContent).toContain("TransLink");
    stop();
    vi.unstubAllGlobals();
  });

  it("says what to set up first", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ updatedAt: 0, configured: false, stops: {} })));
    const el = document.createElement("div");
    const stop = transit(el, newWidget("transit", "t2", { x: 0, y: 0 }), ctx);
    await vi.waitFor(() => expect(el.textContent).toContain("TransLink API key"));
    stop();
    vi.unstubAllGlobals();
  });
});

describe("sports", () => {
  const VAN = { abbr: "VAN", name: "Canucks" };
  const TOR = { abbr: "TOR", name: "Maple Leafs" };
  const now = new Date("2026-11-21T22:00:00Z"); // Saturday, 3 PM in Vancouver (UTC−7 all year from 2026)
  const final = {
    id: "401",
    start: Date.parse("2026-11-21T03:00:00Z"),
    state: "post" as const,
    detail: "Final/OT",
    us: "home" as const,
    home: { ...VAN, score: "3" },
    away: { ...TOR, score: "2" },
  };
  const tonight = {
    id: "402",
    start: Date.parse("2026-11-22T02:00:00Z"),
    state: "pre" as const,
    detail: "",
    us: "away" as const,
    home: TOR,
    away: VAN,
  };
  const team = { id: "canucks", league: "nhl", name: "Vancouver Canucks", abbr: "VAN", color: "#00205b" };

  it("says when the next game is the way people do", () => {
    const tz = "America/Vancouver";
    expect(when(Date.parse("2026-11-22T02:00:00Z"), now, tz, true)).toBe("Today 7 PM");
    expect(when(Date.parse("2026-11-22T21:30:00Z"), now, tz, true)).toBe("Tomorrow 2:30 PM");
    expect(when(Date.parse("2026-11-25T02:00:00Z"), now, tz, false)).toBe("Tue 19:00");
    expect(when(Date.parse("2026-12-02T03:00:00Z"), now, tz, true)).toBe("Tue Dec 1");
  });

  it("puts the followed team's score first, with the result", () => {
    expect(score(final)).toBe("3–2");
    expect(score({ ...final, us: "away" })).toBe("2–3");
    expect(result(final, "nhl")).toBe("W");
    expect(result({ ...final, us: "away" }, "nhl")).toBe("L");
    expect(result({ ...final, away: { ...TOR, score: "3" } }, "epl")).toBe("D");
    expect(opponent(final)).toBe("vs TOR");
    expect(opponent(tonight)).toBe("@ TOR");
  });

  it("shows last night's result until morning, then the next game", () => {
    const t = { ...team, last: final, next: tonight };
    expect(describeTeam(t, now, "America/Vancouver", true, true)).toMatchObject({
      kind: "next",
      right: "Today 7 PM",
      sub: ["@ TOR", "Last W 3–2 vs TOR"],
    });
    const morning = new Date("2026-11-21T08:00:00Z");
    expect(describeTeam(t, morning, "America/Vancouver", true, true)).toMatchObject({
      kind: "final",
      right: "W 3–2",
      sub: ["Final/OT", "vs TOR", "Next Today 7 PM"],
    });
  });

  it("draws a live score with its period, and flashes it when it changes", async () => {
    vi.useFakeTimers({ now });
    let live = { ...tonight, state: "in" as const, detail: "2nd - 12:34", home: { ...TOR, score: "1" }, away: { ...VAN, score: "1" } };
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ updatedAt: 1, teams: [{ ...team, next: live, last: final }] })));
    const el = document.createElement("div");
    const stop = sports(el, newWidget("sports", "sp", { x: 0, y: 0 }), ctx);
    await vi.advanceTimersByTimeAsync(0);
    const row = () => el.querySelector(".sp-row")!;
    expect(row().className).toBe("sp-row sp-live");
    expect(row().textContent).toBe("LIVEVancouver Canucks1–12nd - 12:34 · @ TOR");
    expect(row().getAttribute("style")).toBe("--team:#00205b");
    live = { ...live, away: { ...VAN, score: "2" } };
    await vi.advanceTimersByTimeAsync(30_000);
    expect(row().className).toBe("sp-row sp-live sp-new");
    stop();
    vi.unstubAllGlobals();
  });

  it("says where to pick teams when none are followed", async () => {
    vi.useFakeTimers({ now });
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ updatedAt: 1, teams: [] })));
    const el = document.createElement("div");
    const stop = sports(el, newWidget("sports", "sp2", { x: 0, y: 0 }), ctx);
    await vi.advanceTimersByTimeAsync(0);
    expect(el.textContent).toBe("Follow teams under Settings › Sports.");
    stop();
    vi.unstubAllGlobals();
  });
});

describe("earth", () => {
  afterEach(() => {
    document.documentElement.classList.remove("saving");
    vi.useRealTimers();
  });

  it("frames earth while the screen is in use, drops it under the screen saver and makes it again on waking", async () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    document.body.append(el);
    const stop = earth(el, newWidget("earth", "ea", { x: 0, y: 0 }), ctx);
    vi.advanceTimersByTime(20); // the first animation frame
    const frame = () => el.querySelector("iframe");
    expect(frame()?.getAttribute("src")).toMatch(
      /^https:\/\/earth\.nullschool\.net\/#current\/wind\/surface\/level\/orthographic=-122\.66,49\.1,\d+\/loc=/,
    );
    expect(frame()?.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin");

    document.documentElement.classList.add("saving");
    await Promise.resolve(); // MutationObserver callbacks run as microtasks
    expect(frame()).toBeNull();

    document.documentElement.classList.remove("saving");
    await Promise.resolve();
    expect(frame()).not.toBeNull();

    stop();
    expect(frame()).toBeNull();
    el.remove();
  });

  it("loads earth again after an hour, for new weather", () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    const stop = earth(el, newWidget("earth", "ea2", { x: 0, y: 0 }), ctx);
    vi.advanceTimersByTime(20);
    const first = el.querySelector("iframe");
    vi.advanceTimersByTime(30 * 60_000);
    expect(el.querySelector("iframe")).toBe(first);
    vi.advanceTimersByTime(RELOAD_MS);
    expect(el.querySelector("iframe")).not.toBe(first);
    expect(el.querySelectorAll("iframe")).toHaveLength(1);
    stop();
  });
});

describe("windy", () => {
  const metric = { ...ctx, payload: { units: "metric" } as DisplayPayload };
  const frame = (el: HTMLElement) => el.querySelector<HTMLIFrameElement>("iframe");

  it("frames Windy's map at the place, takes no touches, and is removed while the screen saver is up", async () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    document.body.append(el);
    const stop = windy(el, newWidget("windy", "wy", { x: 0, y: 0 }), metric);
    await vi.advanceTimersByTimeAsync(20);
    expect(frame(el)?.src).toContain("https://embed.windy.com/embed.html?");
    expect(frame(el)?.src).toContain("lat=49.1&lon=-122.66");
    expect(frame(el)?.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin");
    expect(el.querySelector(".wy-live")).toBeNull();
    document.documentElement.classList.add("saving");
    await vi.advanceTimersByTimeAsync(0);
    expect(frame(el)).toBeNull();
    document.documentElement.classList.remove("saving");
    await vi.advanceTimersByTimeAsync(0);
    expect(frame(el)).not.toBeNull();
    stop();
    expect(frame(el)).toBeNull();
  });

  it("can be moved by hand when it's interactive", async () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    const stop = windy(el, { ...newWidget("windy", "wy2", { x: 0, y: 0 }), interactive: true }, metric);
    await vi.advanceTimersByTimeAsync(20);
    expect(el.querySelector(".wy-live iframe")).not.toBeNull();
    stop();
  });
});
