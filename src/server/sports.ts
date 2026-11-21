import "server-only";

import { z } from "zod";

import type { DashboardConfig, SportsTeam } from "@/lib/config/schema";
import type { SportsData, SportsGame, SportsTeamData } from "@/lib/display/types";
import { LEAGUES, type LeagueId } from "@/lib/sports";

import { cached, getJson } from "./cache";

// Sports scores (Melvin, 2026-11-21): live scores, the last result and the next game for the teams under Settings ›
// Sports. ESPN's public site API (site.api.espn.com) because it is free, needs no key or sign-up, and covers the NHL,
// NBA, NFL, MLB, MLS and European soccer in one shape; the official NHL API covers only hockey, and TheSportsDB's free
// key has no live scores.
//
// Each team's schedule is read every 30 minutes. Only while one of its games is on (from ten minutes before the start
// until it is final) is the league's scoreboard read too, every 30 seconds, for the live score. Every display shares
// both, so ESPN sees the same few requests however many screens there are.

const API = "https://site.api.espn.com/apis/site/v2/sports";
const SCHEDULE_TTL = 30 * 60_000;
const BOARD_TTL = 30_000;
const TEAMS_TTL = 24 * 3_600_000;
const BEFORE_START = 10 * 60_000;
const LONGEST_GAME = 6 * 3_600_000;

// ---- ESPN's shapes (the schedule gives scores as { displayValue }, the scoreboard as a plain string) ----

const statusSchema = z.object({
  type: z.object({
    state: z.enum(["pre", "in", "post"]),
    completed: z.boolean().default(false),
    shortDetail: z.string().default(""),
  }),
});

const scoreSchema = z
  .union([z.string(), z.number().transform(String), z.object({ displayValue: z.string() }).transform((s) => s.displayValue)])
  .optional();

const competitorSchema = z.object({
  homeAway: z.enum(["home", "away"]),
  team: z.object({
    id: z.string(),
    abbreviation: z.string().default(""),
    displayName: z.string().default(""),
    shortDisplayName: z.string().optional(),
  }),
  score: scoreSchema,
});

const eventSchema = z.object({
  id: z.string(),
  date: z.string(),
  status: statusSchema.optional(),
  competitions: z
    .array(z.object({ date: z.string().optional(), competitors: z.array(competitorSchema), status: statusSchema.optional() }))
    .min(1),
});

const eventsSchema = z.object({ events: z.array(z.unknown()).default([]) });

/** A game as the server keeps it: both sides' ids, so one scoreboard serves every team in the league. */
export interface Game extends Omit<SportsGame, "us"> {
  homeId: string;
  awayId: string;
  completed: boolean;
}

function trimEvent(raw: unknown): Game | null {
  const p = eventSchema.safeParse(raw);
  if (!p.success) return null;
  const e = p.data;
  const c = e.competitions[0]!;
  const status = c.status ?? e.status;
  const start = Date.parse(c.date ?? e.date);
  const home = c.competitors.find((x) => x.homeAway === "home");
  const away = c.competitors.find((x) => x.homeAway === "away");
  if (!status || !home || !away || Number.isNaN(start)) return null;
  const state = status.type.state;
  const side = (x: z.infer<typeof competitorSchema>) => ({
    abbr: x.team.abbreviation.slice(0, 8),
    name: (x.team.shortDisplayName ?? x.team.displayName).slice(0, 40),
    ...(state !== "pre" && x.score !== undefined ? { score: x.score.slice(0, 6) } : {}),
  });
  return {
    id: e.id,
    start,
    state,
    completed: status.type.completed,
    detail: status.type.shortDetail.slice(0, 40),
    homeId: home.team.id,
    awayId: away.team.id,
    home: side(home),
    away: side(away),
  };
}

/** Every readable game in an ESPN schedule or scoreboard answer; one odd event never hides the rest. */
export function trimEvents(raw: unknown): Game[] {
  return eventsSchema
    .parse(raw)
    .events.map(trimEvent)
    .filter((g): g is Game => g !== null);
}

const teamsSchema = z.object({
  sports: z.array(
    z.object({
      leagues: z.array(
        z.object({
          teams: z.array(
            z.object({
              team: z.object({
                id: z.string(),
                abbreviation: z.string().default(""),
                displayName: z.string(),
                color: z.string().optional(),
                isActive: z.boolean().optional(),
              }),
            }),
          ),
        }),
      ),
    }),
  ),
});

export interface TeamChoice {
  teamId: string;
  name: string;
  abbr: string;
  color: string;
}

export function trimTeams(raw: unknown): TeamChoice[] {
  return teamsSchema
    .parse(raw)
    .sports.flatMap((s) => s.leagues.flatMap((l) => l.teams))
    .map(({ team: t }) => t)
    .filter((t) => t.isActive !== false && /^[0-9]{1,8}$/.test(t.id))
    .map((t) => ({
      teamId: t.id,
      name: t.displayName.slice(0, 60),
      abbr: (t.abbreviation || t.displayName.slice(0, 3).toUpperCase()).slice(0, 8),
      color: /^[0-9a-fA-F]{6}$/.test(t.color ?? "") ? `#${t.color!.toLowerCase()}` : "#4a6fa5",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---- Reading ESPN ----

/** The teams of a league, for the admin panel's picker. */
export async function leagueTeams(league: LeagueId, now = Date.now()): Promise<TeamChoice[]> {
  const path = LEAGUES[league].path;
  return (await cached(`sports:teams:${league}`, TEAMS_TTL, async () => trimTeams(await getJson(`${API}/${path}/teams?limit=200`)), now))
    .value;
}

function schedule(team: SportsTeam, now: number) {
  const path = LEAGUES[team.league as LeagueId].path;
  return cached(
    `sports:schedule:${team.league}:${team.teamId}`,
    SCHEDULE_TTL,
    async () => {
      const url = `${API}/${path}/teams/${team.teamId}/schedule`;
      // A soccer team's schedule lists results only; its fixtures come with ?fixture=true.
      if (!path.startsWith("soccer/")) return trimEvents(await getJson(url));
      const [results, fixtures] = await Promise.all([getJson(url), getJson(`${url}?fixture=true`)]);
      return [...trimEvents(results), ...trimEvents(fixtures)];
    },
    now,
  );
}

/** ESPN's scoreboard is by day in Eastern time. */
const easternDay = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(ms)
    .replaceAll("-", "");

function scoreboard(league: string, day: string, now: number) {
  const path = LEAGUES[league as LeagueId].path;
  return cached(
    `sports:board:${league}:${day}`,
    BOARD_TTL,
    async () => trimEvents(await getJson(`${API}/${path}/scoreboard?dates=${day}`)),
    now,
  );
}

/** Whether a game might be on right now, so its live score is worth reading. */
export const mightBeOn = (g: Game, now: number) =>
  !g.completed && g.state !== "post" && g.start - BEFORE_START <= now && now - g.start <= LONGEST_GAME;

/** The latest finished game, and the one being played or coming next. */
export function pick(games: Game[], teamId: string, now: number): { last?: SportsGame; next?: SportsGame } {
  const mine = [...new Map(games.filter((g) => g.homeId === teamId || g.awayId === teamId).map((g) => [g.id, g])).values()];
  const done = mine.filter((g) => g.state === "post" && g.completed).sort((a, b) => b.start - a.start);
  const coming = mine
    .filter((g) => g.state === "in" || (g.state === "pre" && now - g.start <= LONGEST_GAME))
    .sort((a, b) => a.start - b.start);
  const out = (g: Game): SportsGame => ({
    id: g.id,
    start: g.start,
    state: g.state,
    detail: g.detail,
    us: g.homeId === teamId ? "home" : "away",
    home: g.home,
    away: g.away,
  });
  return { ...(done[0] ? { last: out(done[0]) } : {}), ...(coming[0] ? { next: out(coming[0]) } : {}) };
}

async function teamData(team: SportsTeam, now: number): Promise<SportsTeamData> {
  const base = { id: team.id, league: team.league, name: team.name, abbr: team.abbr, color: team.color };
  let games: Game[];
  try {
    games = (await schedule(team, now)).value;
  } catch {
    return { ...base, error: true };
  }
  // A game that might be on: the scoreboard has its live score. If the scoreboard fails, the schedule's copy stands.
  const days = [...new Set(games.filter((g) => mightBeOn(g, now)).map((g) => easternDay(g.start)))];
  for (const day of days) {
    const board = await scoreboard(team.league, day, now).catch(() => null);
    if (!board) continue;
    const live = new Map(board.value.map((g) => [g.id, g]));
    games = games.map((g) => live.get(g.id) ?? g);
  }
  return { ...base, ...pick(games, team.teamId, now) };
}

/** Every followed team's games. One team failing leaves it marked; the others still show. */
export async function sportsFeed(config: DashboardConfig, now = Date.now()): Promise<SportsData> {
  const teams = await Promise.all(config.integrations.sports.teams.map((t) => teamData(t, now)));
  return { updatedAt: now, teams };
}
