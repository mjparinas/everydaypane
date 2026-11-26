import "server-only";

import type { DashboardConfig } from "@/lib/config/schema";
import { applyFlags, FEATURE_FLAGS, isFeatureFlag, LEGACY_FLAGS, type FeatureFlag, type FlagsOff } from "@/lib/featureFlags";

import { loadConfig, type StoredConfig } from "./config";
import { query, run } from "./db";

// Platform feature flags, read on the server only (Melvin, 2026-11-26). The registry is src/lib/featureFlags.ts;
// this file stores staff's switches (`feature_flags`, one value for everyone) and gives each display route the
// household's settings with switched-off integrations dropped (`loadDisplayConfig`). There are no per-household
// overrides (Melvin, 2026-11-26: widgets still under development must not be switched on for one household), so the
// short-lived `account_feature_flags` table from the first version is never read.

export type FlagState = FeatureFlag & {
  /** What the platform switch says (the default until staff set it). */
  value: boolean;
  fromDefault: boolean;
};

const truthy = (v: unknown) => v === "true" || v === "1" || v === 1 || v === true;

async function platformValues(): Promise<Map<string, boolean>> {
  const rows = await query<{ name: string; value: string }>("SELECT name, value FROM feature_flags");
  const out = new Map<string, boolean>();
  for (const r of rows) {
    for (const name of LEGACY_FLAGS[r.name] ?? []) if (!out.has(name)) out.set(name, truthy(r.value));
  }
  // Registry names win over a legacy row that maps to the same flag.
  for (const r of rows) if (isFeatureFlag(r.name)) out.set(r.name, truthy(r.value));
  return out;
}

export async function listFlags(): Promise<FlagState[]> {
  const values = await platformValues();
  return FEATURE_FLAGS.map((f) => {
    const v = values.get(f.name);
    return { ...f, value: v ?? f.default, fromDefault: v === undefined };
  });
}

/** Flag names that are off, read fresh from the database. The same for every household. */
export async function flagsOffFresh(): Promise<Set<string>> {
  const platform = await platformValues();
  const off = new Set<string>();
  for (const f of FEATURE_FLAGS) if (!(platform.get(f.name) ?? f.default)) off.add(f.name);
  return off;
}

// Display feeds poll every few seconds, so each server instance keeps the answer briefly. The state route
// (which decides what the wall draws) reads fresh, and a change bumps the settings version, so a wall never keeps a
// switched-off widget; a feed may answer for up to this long after the switch.
const CACHE_MS = 15_000;
let cache: { at: number; off: Set<string> } | null = null;

export async function flagsOff(now = Date.now()): Promise<FlagsOff> {
  if (cache && now - cache.at < CACHE_MS) return cache.off;
  const off = await flagsOffFresh();
  cache = { at: now, off };
  return off;
}

export function clearFlagCache(): void {
  cache = null;
}

export async function featureOn(name: string): Promise<boolean> {
  return !(await flagsOff()).has(name);
}

/** The settings a display (and every display feed) works from: `loadConfig` with switched-off integrations dropped. */
export async function loadDisplayConfig(accountId: string, opts: { fresh?: boolean } = {}): Promise<StoredConfig> {
  const [stored, off] = await Promise.all([loadConfig(accountId), opts.fresh ? flagsOffFresh() : flagsOff()]);
  return { ...stored, config: applyFlags(stored.config, off) };
}

/** Same as `applyFlags` for a config already in hand. */
export async function displayConfigOf(config: DashboardConfig): Promise<DashboardConfig> {
  return applyFlags(config, await flagsOff());
}

function needle(name: string): string | null {
  const [kind, key] = name.split(".", 2) as [string, string];
  if (kind === "widget") return `%"type":"${key}"%`;
  if (kind === "photos") return `%"kind":"${key}"%`;
  // Home Assistant also covers cameras, who's home, the doorbell and motion sensors, so every household reloads.
  if (kind === "smartHome" && key === "homeAssistant") return null;
  return `%"provider":"${key}"%`;
}

/**
 * Bumps the settings version of every household a flag could change, so their walls reload with it. Households
 * whose saved settings never mention the widget, provider or source are left alone, so their household panel isn't
 * told someone else changed the dashboard.
 */
async function touchAffected(name: string, now: number): Promise<number> {
  const like = needle(name);
  return like
    ? run("UPDATE account_config SET version = version + 1, updated_at = ? WHERE json LIKE ?", [now, like])
    : run("UPDATE account_config SET version = version + 1, updated_at = ?", [now]);
}

function check(name: string) {
  if (!isFeatureFlag(name)) throw new Error("Unknown flag");
}

export async function setFlag(name: string, value: boolean, now = Date.now()): Promise<void> {
  check(name);
  await run(
    `INSERT INTO feature_flags (name, value, share, updated_at) VALUES (?, ?, 100, ?)
     ON CONFLICT(name) DO UPDATE SET value = excluded.value, share = 100, updated_at = excluded.updated_at`,
    [name, value ? "true" : "false", now],
  );
  clearFlagCache();
  await touchAffected(name, now);
}

export async function clearFlag(name: string, now = Date.now()): Promise<void> {
  check(name);
  const legacy = Object.entries(LEGACY_FLAGS)
    .filter(([, names]) => names.includes(name))
    .map(([old]) => old);
  for (const old of [name, ...legacy]) await run("DELETE FROM feature_flags WHERE name = ?", [old]);
  clearFlagCache();
  await touchAffected(name, now);
}
