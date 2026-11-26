import "server-only";

import type { DashboardConfig } from "@/lib/config/schema";
import { applyFlags, FEATURE_FLAGS, isFeatureFlag, LEGACY_FLAGS, type FeatureFlag, type FlagsOff } from "@/lib/featureFlags";

import { loadConfig, type StoredConfig } from "./config";
import { query, run } from "./db";

// Platform feature flags, read on the server only (Melvin, 2026-11-26). The registry is src/lib/featureFlags.ts;
// this file stores staff's switches (`feature_flags` for everyone, `account_feature_flags` for one household) and
// gives each display route the household's settings with switched-off integrations dropped (`loadDisplayConfig`).

export type FlagState = FeatureFlag & {
  /** What the platform switch says (the default until staff set it). */
  value: boolean;
  fromDefault: boolean;
};

export type HouseholdFlagState = FlagState & {
  /** The household's own override, or null when it follows the platform. */
  override: boolean | null;
  /** What this household actually gets. */
  effective: boolean;
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

async function householdValues(accountId: string): Promise<Map<string, boolean>> {
  const rows = await query<{ name: string; value: number }>("SELECT name, value FROM account_feature_flags WHERE account_id = ?", [
    accountId,
  ]);
  return new Map(rows.filter((r) => isFeatureFlag(r.name)).map((r) => [r.name, truthy(r.value)]));
}

export async function listFlags(): Promise<FlagState[]> {
  const values = await platformValues();
  return FEATURE_FLAGS.map((f) => {
    const v = values.get(f.name);
    return { ...f, value: v ?? f.default, fromDefault: v === undefined };
  });
}

export async function listHouseholdFlags(accountId: string): Promise<HouseholdFlagState[]> {
  const [platform, own] = await Promise.all([listFlags(), householdValues(accountId)]);
  return platform.map((f) => {
    const override = own.get(f.name) ?? null;
    return { ...f, override, effective: override ?? f.value };
  });
}

/** Flag names that are off for this household, read fresh from the database. */
export async function flagsOffFresh(accountId: string): Promise<Set<string>> {
  const [platform, own] = await Promise.all([platformValues(), householdValues(accountId)]);
  const off = new Set<string>();
  for (const f of FEATURE_FLAGS) if (!(own.get(f.name) ?? platform.get(f.name) ?? f.default)) off.add(f.name);
  return off;
}

// Display feeds poll every few seconds, so each server instance keeps a household's answer briefly. The state route
// (which decides what the wall draws) reads fresh, and a change bumps the settings version, so a wall never keeps a
// switched-off widget; a feed may answer for up to this long after the switch.
const CACHE_MS = 15_000;
const cache = new Map<string, { at: number; off: Set<string> }>();

export async function flagsOff(accountId: string, now = Date.now()): Promise<FlagsOff> {
  const hit = cache.get(accountId);
  if (hit && now - hit.at < CACHE_MS) return hit.off;
  const off = await flagsOffFresh(accountId);
  cache.set(accountId, { at: now, off });
  return off;
}

export function clearFlagCache(): void {
  cache.clear();
}

export async function featureOn(accountId: string, name: string): Promise<boolean> {
  return !(await flagsOff(accountId)).has(name);
}

/** The settings a display (and every display feed) works from: `loadConfig` with switched-off integrations dropped. */
export async function loadDisplayConfig(accountId: string, opts: { fresh?: boolean } = {}): Promise<StoredConfig> {
  const [stored, off] = await Promise.all([loadConfig(accountId), opts.fresh ? flagsOffFresh(accountId) : flagsOff(accountId)]);
  return { ...stored, config: applyFlags(stored.config, off) };
}

/** Same as `applyFlags` for a config already in hand. */
export async function displayConfigOf(accountId: string, config: DashboardConfig): Promise<DashboardConfig> {
  return applyFlags(config, await flagsOff(accountId));
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
async function touchAffected(name: string, accountId: string | null, now: number): Promise<number> {
  if (accountId) return run("UPDATE account_config SET version = version + 1, updated_at = ? WHERE account_id = ?", [now, accountId]);
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
  await touchAffected(name, null, now);
}

export async function clearFlag(name: string, now = Date.now()): Promise<void> {
  check(name);
  const legacy = Object.entries(LEGACY_FLAGS)
    .filter(([, names]) => names.includes(name))
    .map(([old]) => old);
  for (const old of [name, ...legacy]) await run("DELETE FROM feature_flags WHERE name = ?", [old]);
  clearFlagCache();
  await touchAffected(name, null, now);
}

/** A household's own value for a flag; null removes the override so the household follows the platform again. */
export async function setHouseholdFlag(accountId: string, name: string, value: boolean | null, now = Date.now()): Promise<void> {
  check(name);
  if (value === null) await run("DELETE FROM account_feature_flags WHERE account_id = ? AND name = ?", [accountId, name]);
  else
    await run(
      `INSERT INTO account_feature_flags (account_id, name, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(account_id, name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [accountId, name, value ? 1 : 0, now],
    );
  clearFlagCache();
  await touchAffected(name, accountId, now);
}
