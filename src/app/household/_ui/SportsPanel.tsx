"use client";

import { useEffect, useState } from "react";

import { LEAGUE_IDS, LEAGUES, MAX_TEAMS, type LeagueId } from "@/lib/sports";

import { ConfirmButton, Section, Select } from "./fields";
import { newId, useAdmin } from "./store";

// Sports scores (Melvin, 2026-11-21: "allow to customize the sports and the teams"): pick a league, then a team from
// ESPN's list for it. Only the team's id, name, abbreviation and colour are kept; scores are read by the server
// (src/server/sports.ts).

interface TeamChoice {
  teamId: string;
  name: string;
  abbr: string;
  color: string;
}

export function SportsPanel() {
  const teams = useAdmin((s) => s.config.integrations.sports.teams);
  const edit = useAdmin((s) => s.edit);
  const [league, setLeague] = useState<LeagueId>("nhl");
  const [teamId, setTeamId] = useState("");
  // ESPN's team list is asked for only once the admin starts adding a team, so opening Settings never waits on (or
  // shows an error from) ESPN.
  const [adding, setAdding] = useState(false);
  // The answer for the league it was asked for, so switching leagues shows "Loading" until its own list arrives.
  const [loaded, setLoaded] = useState<{ league: LeagueId; teams?: TeamChoice[]; error?: string } | null>(null);
  const choices = loaded?.league === league ? (loaded.teams ?? null) : null;
  const error = loaded?.league === league ? (loaded.error ?? "") : "";

  useEffect(() => {
    if (!adding) return;
    let live = true;
    fetch(`/api/admin/sports/?${new URLSearchParams({ league })}`)
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as { teams?: TeamChoice[]; error?: string };
        if (!live) return;
        setLoaded(r.ok && body.teams ? { league, teams: body.teams } : { league, error: body.error ?? "Couldn't load the teams." });
      })
      .catch(() => live && setLoaded({ league, error: "Couldn't load the teams." }));
    return () => {
      live = false;
    };
  }, [league, adding]);

  const followed = new Set(teams.map((t) => `${t.league}:${t.teamId}`));
  const open = (choices ?? []).filter((c) => !followed.has(`${league}:${c.teamId}`));
  const picked = open.find((c) => c.teamId === teamId) ?? open[0];

  return (
    <Section title="Sports">
      <p className="text-sm text-soft">
        Teams to follow on the sports widget: live scores, the last result and the next game. Scores come from ESPN, with nothing to sign up
        for.
      </p>

      {teams.length > 0 && (
        <ul className="grid gap-2">
          {teams.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
              <span aria-hidden="true" className="h-6 w-1.5 flex-none rounded-full" style={{ background: t.color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{t.name}</span>
                <span className="text-xs text-soft">{LEAGUES[t.league].name}</span>
              </span>
              <ConfirmButton
                label="Remove"
                onConfirm={() => edit((c) => void (c.integrations.sports.teams = c.integrations.sports.teams.filter((x) => x.id !== t.id)))}
              />
            </li>
          ))}
        </ul>
      )}

      {teams.length < MAX_TEAMS && !adding ? (
        <button type="button" className="btn-ghost justify-self-start" onClick={() => setAdding(true)}>
          Follow a team
        </button>
      ) : teams.length < MAX_TEAMS ? (
        <div className="grid gap-2 rounded-xl border border-dashed border-line p-3">
          <Select
            label="League"
            value={league}
            options={LEAGUE_IDS.map((id) => ({ value: id, label: `${LEAGUES[id].name} (${LEAGUES[id].sport})` }))}
            onChange={setLeague}
          />
          {error && <p className="text-sm text-bad">{error}</p>}
          {!error && !choices && <p className="text-sm text-soft">Loading teams…</p>}
          {choices && open.length > 0 && picked && (
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Select
                  label="Team"
                  value={picked.teamId}
                  options={open.map((c) => ({ value: c.teamId, label: c.name }))}
                  onChange={setTeamId}
                />
              </div>
              <button
                type="button"
                className="btn-primary"
                onClick={() =>
                  edit((c) => {
                    const list = c.integrations.sports.teams;
                    if (list.length < MAX_TEAMS) list.push({ id: newId("team"), league, ...picked });
                  })
                }
              >
                Follow
              </button>
            </div>
          )}
          {choices && open.length === 0 && <p className="text-sm text-soft">You follow every team in this league.</p>}
        </div>
      ) : (
        <p className="text-xs text-soft">Twelve teams is the most.</p>
      )}
      <p className="text-xs text-soft">Save to send the change to your displays.</p>
    </Section>
  );
}
