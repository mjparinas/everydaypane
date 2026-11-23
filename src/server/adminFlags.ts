import "server-only";

import { query, run } from "./db";

export type FlagDef = { name: string; label: string; description: string; default: boolean; group: string };

/** Kill switches for heavy or third-party integrations (Tuned Flags pattern). */
export const FLAGS: FlagDef[] = [
  {
    name: "amazon_photos",
    label: "Amazon Photos",
    description: "List and serve Amazon shared albums and people.",
    default: true,
    group: "Photos",
  },
  {
    name: "home_assistant",
    label: "Home Assistant",
    description: "HA entity states, cameras and music through HA.",
    default: true,
    group: "Smart home",
  },
  { name: "nest", label: "Nest", description: "Google Nest Device Access devices.", default: true, group: "Smart home" },
  { name: "music_spotify", label: "Spotify music", description: "Direct Spotify Web API music widget.", default: true, group: "Music" },
  { name: "music_sonos", label: "Sonos music", description: "Direct Sonos Control API music widget.", default: true, group: "Music" },
  { name: "earth_map", label: "Earth wind map", description: "earth.nullschool.net iframe widget.", default: true, group: "Display" },
  { name: "radar", label: "Rain radar", description: "Environment Canada radar widget.", default: true, group: "Display" },
  { name: "package_tracking", label: "Package tracking", description: "Live package status API.", default: true, group: "Integrations" },
];

export type FlagValue = { name: string; value: boolean; share: number; fromDefault: boolean };

export async function listFlags(): Promise<(FlagDef & FlagValue)[]> {
  const rows = await query<{ name: string; value: string; share: number }>("SELECT name, value, share FROM feature_flags");
  const by = new Map(rows.map((r) => [r.name, r]));
  return FLAGS.map((f) => {
    const row = by.get(f.name);
    if (!row) return { ...f, value: f.default, share: 100, fromDefault: true };
    return { ...f, value: row.value === "true" || row.value === "1", share: Number(row.share) || 100, fromDefault: false };
  });
}

export async function setFlag(name: string, value: boolean, share = 100, now = Date.now()): Promise<void> {
  if (!FLAGS.some((f) => f.name === name)) throw new Error("Unknown flag");
  await run(
    `INSERT INTO feature_flags (name, value, share, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET value = excluded.value, share = excluded.share, updated_at = excluded.updated_at`,
    [name, value ? "true" : "false", Math.max(0, Math.min(100, share)), now],
  );
}

export async function clearFlag(name: string): Promise<void> {
  await run("DELETE FROM feature_flags WHERE name = ?", [name]);
}

/** Runtime read: true unless an override turns it off (share ignored for bool kill switches for now). */
export async function flagOn(name: string): Promise<boolean> {
  const def = FLAGS.find((f) => f.name === name);
  if (!def) return true;
  const rows = await query<{ value: string }>("SELECT value FROM feature_flags WHERE name = ?", [name]);
  if (!rows[0]) return def.default;
  return rows[0].value === "true" || rows[0].value === "1";
}
