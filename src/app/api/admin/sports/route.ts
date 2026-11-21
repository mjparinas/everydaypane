import { z } from "zod";

import { LEAGUE_IDS } from "@/lib/sports";
import { json, unauthorized } from "@/server/http";
import { leagueTeams } from "@/server/sports";
import { adminFor } from "@/server/viewer";

const league = z.enum(LEAGUE_IDS);

/** Settings › Sports: the teams of a league, so the admin can pick which to follow. */
export async function GET(req: Request) {
  if (!(await adminFor(req))) return unauthorized();
  const p = league.safeParse(new URL(req.url).searchParams.get("league"));
  if (!p.success) return json({ error: "Pick a league" }, 400);
  try {
    return json({ teams: await leagueTeams(p.data) });
  } catch {
    return json({ error: "ESPN didn't answer. Try again in a minute." }, 502);
  }
}
