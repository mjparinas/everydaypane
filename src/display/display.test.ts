// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Widget } from "@/lib/config/schema";
import { newWidget } from "@/lib/config/widgets";
import type { ChoresData, DisplayPayload, TasksData } from "@/lib/display/types";

import { shortTime } from "./format";
import { kindOf, label, weatherIcon } from "./icons";
import { aqhiBand, usAqiBand } from "./widgets/air";
import { calendarMonth } from "./widgets/calendar";
import { chores, columns } from "./widgets/chores";
import { clock } from "./widgets/clock";
import { commute, distance, duration, timing, trafficLevel } from "./widgets/commute";
import { countdown } from "./widgets/countdown";
import { ferries, fullness, hasLeft } from "./widgets/ferries";
import { controlFor, stateText } from "./widgets/ha";
import { meals } from "./widgets/meals";
import { F, media, nowPlaying, positionNow } from "./widgets/media";
import { dueLabel, shownLists, tasks, UNDO_MS } from "./widgets/tasks";

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
    await vi.waitFor(() =>
      expect(el.querySelector(".w-empty:not([hidden])")?.textContent).toBe("Connect Sonos under Settings in the admin panel."),
    );
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
  };

  it("labels due dates", () => {
    expect(dueLabel("2026-11-17", "2026-11-17")).toEqual({ text: "Today", overdue: false });
    expect(dueLabel("2026-11-18", "2026-11-17")).toEqual({ text: "Tomorrow", overdue: false });
    expect(dueLabel("2026-11-16", "2026-11-17")).toEqual({ text: "Yesterday", overdue: true });
    expect(dueLabel("2026-11-01", "2026-11-17")).toEqual({ text: "Overdue", overdue: true });
  });

  it("shows the picked lists, up to the count in all", () => {
    expect(shownLists(data, [], 2).map((l) => l.tasks.length)).toEqual([2, 0]);
    expect(shownLists(data, ["chores"], 5).map((l) => l.name)).toEqual(["Chores"]);
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
    expect(posts).toEqual([{ list: "groceries", task: "t2" }]);
    expect([...el.querySelectorAll(".tk-title")].map((t) => t.textContent)).toEqual(["Milk", "Feed the cat"]);
    stop();
    vi.unstubAllGlobals();
  });
});

describe("month calendar", () => {
  type Month = Extract<Widget, { type: "calendarMonth" }>;
  const month = async (settings: Partial<Month>) => {
    vi.useFakeTimers({ now: new Date("2026-11-17T20:00:00Z") });
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ connected: true, updatedAt: 1, events: [] })));
    const el = document.createElement("div");
    const stop = calendarMonth(el, { ...(newWidget("calendarMonth", "mo", { x: 0, y: 0 }) as Month), ...settings }, ctx);
    await vi.advanceTimersByTimeAsync(0);
    const title = el.querySelector(".mo-title")?.textContent ?? null;
    const days = [...el.querySelectorAll(".mo-num")].map((n) => n.textContent);
    const names = [...el.querySelectorAll(".mo-name")].map((n) => n.textContent);
    const rows = el.querySelector<HTMLElement>(".mo-days")?.style.gridTemplateRows;
    stop();
    vi.unstubAllGlobals();
    return { title, days, names, rows };
  };

  it("shows the whole month with its title by default", async () => {
    const m = await month({});
    expect(m.title).toBe("November 2026");
    expect(m.days).toHaveLength(35);
    expect(m.names).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
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
    expect(m.days.slice(16, 18)).toEqual(["Dec 1", "2"]);
    expect(m.title).toBe("November – December 2026");
  });

  it("hides Saturday and Sunday when weekends are off", async () => {
    const m = await month({ weeks: 2, showWeekends: false, weekStartsOn: 1 });
    expect(m.names).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    expect(m.days).toEqual(["16", "17", "18", "19", "20", "23", "24", "25", "26", "27"]);
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
    people: [
      { id: "ana", name: "Ana", emoji: "🦊", color: "#e8590c", goal: 10, stars: 4 },
      { id: "ben", name: "Ben", emoji: "", color: "#1c7ed6", goal: 0, stars: 0 },
    ],
    chores: [
      { id: "bed", name: "Make the bed", emoji: "🛏️", stars: 1 },
      { id: "dishes", name: "Dishes", emoji: "", stars: 3 },
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
