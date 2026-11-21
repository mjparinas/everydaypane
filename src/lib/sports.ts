// The leagues the sports widget can follow (Melvin, 2026-11-21: "allow to customize the sports and the teams"). Scores
// and schedules come from ESPN's public site API (src/server/sports.ts), which needs no key; `path` is its
// sport/league part. Kept free of zod so the admin panel and the server share it.

export const LEAGUES = {
  nhl: { name: "NHL", sport: "Hockey", path: "hockey/nhl" },
  nba: { name: "NBA", sport: "Basketball", path: "basketball/nba" },
  wnba: { name: "WNBA", sport: "Basketball", path: "basketball/wnba" },
  nfl: { name: "NFL", sport: "Football", path: "football/nfl" },
  mlb: { name: "MLB", sport: "Baseball", path: "baseball/mlb" },
  mls: { name: "MLS", sport: "Soccer", path: "soccer/usa.1" },
  epl: { name: "Premier League", sport: "Soccer", path: "soccer/eng.1" },
  ucl: { name: "Champions League", sport: "Soccer", path: "soccer/uefa.champions" },
} as const;

export type LeagueId = keyof typeof LEAGUES;
export const LEAGUE_IDS = Object.keys(LEAGUES) as [LeagueId, ...LeagueId[]];

/** Twelve teams keeps the server's calls to ESPN modest and the widget readable. */
export const MAX_TEAMS = 12;
