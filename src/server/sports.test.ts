import { afterEach, describe, expect, it, vi } from "vitest";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";

import { GET as adminGET } from "@/app/api/admin/sports/route";
import { GET as displayGET } from "@/app/api/display/sports/route";
import { defaultConfig } from "@/lib/config/defaults";
import type { DashboardConfig } from "@/lib/config/schema";
import type { SportsData } from "@/lib/display/types";
import { cookieFor, req, useTestServer } from "@/test/server";

import { clearMemoryCache } from "./cache";
import { loadConfig, saveConfig } from "./config";
import { addDevice } from "./devices";
import { mightBeOn, pick, sportsFeed, trimEvents, trimTeams } from "./sports";

// ESPN's answers, trimmed to the fields we read, in the shapes its public site API gives (this sandbox can't reach
// ESPN). The schedule gives scores as { value, displayValue }; the scoreboard as plain strings.

const VAN = { id: "22", abbreviation: "VAN", displayName: "Vancouver Canucks", shortDisplayName: "Canucks" };
const TOR = { id: "21", abbreviation: "TOR", displayName: "Toronto Maple Leafs", shortDisplayName: "Maple Leafs" };
const SEA = { id: "124292", abbreviation: "SEA", displayName: "Seattle Kraken", shortDisplayName: "Kraken" };

type Score = { value: number; displayValue: string } | string | undefined;
function event(
  id: string,
  date: string,
  state: "pre" | "in" | "post",
  home: typeof VAN,
  away: typeof VAN,
  scores: [Score, Score] = [undefined, undefined],
  shortDetail = state === "post" ? "Final" : state === "in" ? "2nd - 12:34" : "11/22 - 7:00 PM EST",
) {
  return {
    id,
    date,
    name: `${away.displayName} at ${home.displayName}`,
    competitions: [
      {
        id,
        date,
        competitors: [
          { id: home.id, homeAway: "home", team: home, ...(scores[0] !== undefined ? { score: scores[0] } : {}) },
          { id: away.id, homeAway: "away", team: away, ...(scores[1] !== undefined ? { score: scores[1] } : {}) },
        ],
        status: { clock: 0, period: 0, type: { name: "STATUS", state, completed: state === "post", description: "", shortDetail } },
      },
    ],
  };
}
const s = (n: number) => ({ value: n, displayValue: String(n) });

// Saturday 2026-11-21 in Vancouver. Last night VAN beat SEA 3–2 at home; tonight VAN is in Toronto at 4 PM Pacific.
const NOW = Date.parse("2026-11-21T22:00:00Z"); // 3 PM in Vancouver
const lastNight = event("401", "2026-11-21T03:00Z", "post", VAN, SEA, [s(3), s(2)]);
const tonight = event("402", "2026-11-21T23:00Z", "pre", TOR, VAN);
const later = event("403", "2026-11-25T03:00Z", "pre", VAN, TOR);
const schedule = { team: VAN, events: [later, lastNight, tonight, { id: "bad", date: "nope", competitions: [] }] };

const teams = {
  sports: [
    {
      leagues: [
        {
          teams: [
            { team: { ...VAN, color: "00205B", isActive: true } },
            { team: { ...TOR, color: "zzz", isActive: true } },
            { team: { id: "99", abbreviation: "OLD", displayName: "Arizona Coyotes", color: "8C2633", isActive: false } },
          ],
        },
      ],
    },
  ],
};

function following(config: DashboardConfig): DashboardConfig {
  const c = structuredClone(config);
  c.integrations.sports.teams = [{ id: "canucks", league: "nhl", teamId: "22", name: "Vancouver Canucks", abbr: "VAN", color: "#00205b" }];
  return c;
}

describe("sports data", () => {
  it("reads ESPN's games, scores as text, and skips an event it can't read", () => {
    const games = trimEvents(schedule);
    expect(games.map((g) => g.id)).toEqual(["403", "401", "402"]);
    expect(games[1]).toEqual({
      id: "401",
      start: Date.parse("2026-11-21T03:00:00Z"),
      state: "post",
      completed: true,
      detail: "Final",
      homeId: "22",
      awayId: "124292",
      home: { abbr: "VAN", name: "Canucks", score: "3" },
      away: { abbr: "SEA", name: "Kraken", score: "2" },
    });
    expect(games[2]?.home).toEqual({ abbr: "TOR", name: "Maple Leafs" }); // no score before the start
  });

  it("picks the last final and the next game, from the team's side", () => {
    const { last, next } = pick(trimEvents(schedule), "22", NOW);
    expect(last).toMatchObject({ id: "401", us: "home" });
    expect(next).toMatchObject({ id: "402", us: "away", state: "pre" });
  });

  it("reads the live scoreboard only around a game", () => {
    const g = trimEvents({ events: [tonight] })[0]!;
    expect(mightBeOn(g, Date.parse("2026-11-21T22:49:00Z"))).toBe(false);
    expect(mightBeOn(g, Date.parse("2026-11-21T22:51:00Z"))).toBe(true);
    expect(mightBeOn(g, Date.parse("2026-11-22T05:01:00Z"))).toBe(false);
  });

  it("lists a league's current teams with their colours", () => {
    expect(trimTeams(teams)).toEqual([
      { teamId: "21", name: "Toronto Maple Leafs", abbr: "TOR", color: "#4a6fa5" },
      { teamId: "22", name: "Vancouver Canucks", abbr: "VAN", color: "#00205b" },
    ]);
  });
});

describe("sports routes", () => {
  useTestServer();
  afterEach(() => {
    vi.unstubAllGlobals();
    clearMemoryCache();
  });

  function stubEspn(board: unknown) {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = String(input);
        seen.push(url);
        if (url.includes("/teams/22/schedule")) return Promise.resolve(Response.json(schedule));
        if (url.includes("/scoreboard"))
          return Promise.resolve(board === null ? new Response("busy", { status: 503 }) : Response.json(board));
        return Promise.resolve(new Response("nope", { status: 404 }));
      }),
    );
    return seen;
  }

  it("shows nothing until teams are followed", async () => {
    expect((await sportsFeed(defaultConfig())).teams).toEqual([]);
  });

  it("reads the schedule, and the scoreboard only once a game is on", async () => {
    const live = event("402", "2026-11-21T23:00Z", "in", TOR, VAN, ["1", "2"], "2nd - 12:34");
    const seen = stubEspn({ events: [live] });
    const config = following(defaultConfig());

    const before = await sportsFeed(config, NOW);
    expect(seen).toEqual(["https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams/22/schedule"]);
    expect(before.teams[0]).toMatchObject({ id: "canucks", next: { id: "402", state: "pre" }, last: { id: "401" } });

    const during = await sportsFeed(config, Date.parse("2026-11-22T00:00:00Z"));
    expect(seen.at(-1)).toBe("https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=20261121");
    expect(during.teams[0]?.next).toMatchObject({
      state: "in",
      detail: "2nd - 12:34",
      us: "away",
      home: { abbr: "TOR", score: "1" },
      away: { abbr: "VAN", score: "2" },
    });
  });

  it("keeps the schedule's copy when the scoreboard fails", async () => {
    stubEspn(null);
    const data = await sportsFeed(following(defaultConfig()), Date.parse("2026-11-22T00:00:00Z"));
    expect(data.teams[0]?.next).toMatchObject({ id: "402", state: "pre" });
  });

  it("marks a team whose schedule can't be read, and still shows the others", async () => {
    stubEspn({ events: [] });
    const c = following(defaultConfig());
    c.integrations.sports.teams.push({
      id: "leafs",
      league: "nhl",
      teamId: "21",
      name: "Toronto Maple Leafs",
      abbr: "TOR",
      color: "#00205b",
    });
    const data = await sportsFeed(c, NOW);
    expect(data.teams.map((t) => [t.id, Boolean(t.error), Boolean(t.next)])).toEqual([
      ["canucks", false, true],
      ["leafs", true, false],
    ]);
  });

  it("asks a soccer team's schedule for its fixtures too", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        seen.push(String(input));
        return Promise.resolve(Response.json({ events: [] }));
      }),
    );
    const c = defaultConfig();
    c.integrations.sports.teams = [
      { id: "wfc", league: "mls", teamId: "9727", name: "Vancouver Whitecaps", abbr: "VAN", color: "#00245d" },
    ];
    await sportsFeed(c, NOW);
    expect(seen).toEqual([
      "https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/teams/9727/schedule",
      "https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/teams/9727/schedule?fixture=true",
    ]);
  });

  it("serves displays with a token only", async () => {
    stubEspn({ events: [] });
    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    await saveConfig(LEGACY_ACCOUNT_ID, following(stored.config), stored.version);
    const { token } = await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null);
    const r = await displayGET(req("/api/display/sports/", { headers: { "x-display-token": token } }));
    expect(((await r.json()) as SportsData).teams.map((t) => t.name)).toEqual(["Vancouver Canucks"]);
    expect((await displayGET(req("/api/display/sports/"))).status).toBe(401);
  });

  it("lists a league's teams for admins only", async () => {
    const fetch = vi.fn<(input: string | URL | Request) => Promise<Response>>(() => Promise.resolve(Response.json(teams)));
    vi.stubGlobal("fetch", fetch);
    const kid = await cookieFor("kid@example.com");
    expect((await adminGET(req("/api/admin/sports/?league=nhl", { headers: { cookie: kid } }))).status).toBe(401);
    const admin = await cookieFor("admin@example.com");
    expect((await adminGET(req("/api/admin/sports/?league=cricket", { headers: { cookie: admin } }))).status).toBe(400);
    const r = await adminGET(req("/api/admin/sports/?league=nhl", { headers: { cookie: admin } }));
    expect(((await r.json()) as { teams: unknown[] }).teams).toHaveLength(2);
    expect(String(fetch.mock.calls[0]?.[0])).toBe("https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams?limit=200");
  });
});
