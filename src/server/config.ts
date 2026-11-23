import "server-only";

import { defaultConfig } from "@/lib/config/defaults";
import { configSchema, type DashboardConfig } from "@/lib/config/schema";

import { ensureAccountsSeeded, LEGACY_ACCOUNT_ID } from "./accounts";
import { query, run } from "./db";
import { publicHaUrl, sameHaUrl } from "./haUrl";
import { removePhotos } from "./library";
import { setSecret } from "./secrets";

export interface StoredConfig {
  config: DashboardConfig;
  version: number;
  updatedAt: number;
}

/** The saved dashboard for a household, or the default one before the first save. */
export async function loadConfig(accountId: string): Promise<StoredConfig> {
  await ensureAccountsSeeded();
  const rows = await query<{ json: string; version: number; updated_at: number }>(
    "SELECT json, version, updated_at FROM account_config WHERE account_id = ?",
    [accountId],
  );
  const row = rows[0];
  if (!row || row.json === "{}")
    return { config: defaultConfig(), version: Number(row?.version ?? 0), updatedAt: Number(row?.updated_at ?? 0) };
  const parsed = configSchema.safeParse(upgrade(JSON.parse(row.json) as unknown));
  return { config: parsed.success ? parsed.data : defaultConfig(), version: Number(row.version), updatedAt: Number(row.updated_at) };
}

export async function configVersion(accountId: string): Promise<number> {
  await ensureAccountsSeeded();
  const rows = await query<{ version: number }>("SELECT version FROM account_config WHERE account_id = ?", [accountId]);
  return Number(rows[0]?.version ?? 0);
}

export type SaveResult = { ok: true; version: number } | { ok: false; status: 409 | 422; error: string; issues?: unknown };

/**
 * Saves the whole document if `baseVersion` is still the latest (so two admin tabs can't silently overwrite each
 * other), bumping the version every display polls for.
 */
export async function saveConfig(accountId: string, input: unknown, baseVersion: number, now = Date.now()): Promise<SaveResult> {
  await ensureAccountsSeeded();
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) return { ok: false, status: 422, error: "The dashboard settings aren't valid", issues: parsed.error.issues };
  const haUrl = parsed.data.integrations.homeAssistant.url;
  if (haUrl && !publicHaUrl(haUrl)) {
    return { ok: false, status: 422, error: "Home Assistant needs a public https address." };
  }
  const previous = await loadConfig(accountId);
  const json = JSON.stringify(parsed.data);
  let version: number | null = null;
  if (baseVersion === 0) {
    const inserted = await run(
      "INSERT INTO account_config (account_id, json, version, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT (account_id) DO NOTHING",
      [accountId, json, now],
    );
    if (inserted === 1) version = 1;
    else {
      // Row exists with version 0 from account create — upgrade in place when still at 0.
      const updated = await run("UPDATE account_config SET json = ?, version = 1, updated_at = ? WHERE account_id = ? AND version = 0", [
        json,
        now,
        accountId,
      ]);
      if (updated === 1) version = 1;
    }
  } else {
    const updated = await run(
      "UPDATE account_config SET json = ?, version = version + 1, updated_at = ? WHERE account_id = ? AND version = ?",
      [json, now, accountId, baseVersion],
    );
    if (updated === 1) version = baseVersion + 1;
  }
  if (version === null) return { ok: false, status: 409, error: "Someone else changed the dashboard. Reload to see their changes." };
  const prevHa = previous.config.integrations.homeAssistant.url;
  if (prevHa && !sameHaUrl(prevHa, haUrl)) {
    await setSecret(accountId, "homeAssistant.token", null, now);
    await setSecret(accountId, "homeAssistant.accessId", null, now);
    await setSecret(accountId, "homeAssistant.accessSecret", null, now);
  }
  const kept = new Set(parsed.data.integrations.photos.sources.filter((s) => s.kind === "library").map((s) => s.id));
  for (const source of previous.config.integrations.photos.sources) {
    if (source.kind === "library" && !kept.has(source.id)) await removePhotos(accountId, source.id);
  }
  return { ok: true, version };
}

/** Bumps the version without changing the document, so displays reload (e.g. after a device is reassigned). */
export async function touchConfig(accountId: string, now = Date.now()): Promise<void> {
  await ensureAccountsSeeded();
  const changed = await run("UPDATE account_config SET version = version + 1, updated_at = ? WHERE account_id = ?", [now, accountId]);
  if (changed === 0) {
    await run("INSERT INTO account_config (account_id, json, version, updated_at) VALUES (?, ?, 1, ?)", [
      accountId,
      JSON.stringify(defaultConfig()),
      now,
    ]);
  }
}

/** @deprecated Prefer loadConfig(accountId). Tests / health may use the grandfather household. */
export async function loadLegacyConfig(): Promise<StoredConfig> {
  await ensureAccountsSeeded();
  return loadConfig(LEGACY_ACCOUNT_ID);
}

/** Fills in sections added after a document was saved, from the defaults. */
export function upgrade(stored: unknown): unknown {
  if (typeof stored !== "object" || stored === null) return stored;
  const d = defaultConfig() as unknown as Record<string, unknown>;
  const s = stored as Record<string, unknown>;
  const out: Record<string, unknown> = { ...d, ...s };
  for (const k of ["integrations", "burnIn", "alerts", "schedule", "location", "school", "chores"]) {
    if (typeof s[k] === "object" && s[k] !== null) out[k] = { ...(d[k] as object), ...(s[k] as object) };
  }
  if (typeof out.integrations === "object" && out.integrations !== null) {
    const ig = out.integrations as Record<string, unknown>;
    const di = d.integrations as Record<string, unknown>;
    if (typeof ig.microsoft === "object" && ig.microsoft !== null) {
      const ms = ig.microsoft as Record<string, unknown>;
      const dm = di.microsoft as Record<string, unknown>;
      if (!Array.isArray(ms.todoLists)) ms.todoLists = dm.todoLists;
    } else ig.microsoft = di.microsoft;
    if (typeof ig.todoist !== "object" || ig.todoist === null) ig.todoist = di.todoist;
  }
  if (Array.isArray(out.views)) {
    out.views = out.views.map((view) => {
      if (typeof view !== "object" || view === null) return view;
      const v = view as Record<string, unknown>;
      if (!Array.isArray(v.widgets)) return view;
      return {
        ...v,
        widgets: v.widgets.map((widget) => {
          if (typeof widget !== "object" || widget === null) return widget;
          const w = { ...(widget as Record<string, unknown>) };
          if (w.type === "sunTimes" && "transparent" in w && !("showBackground" in w)) {
            w.showBackground = w.transparent !== true;
          }
          delete w.transparent;
          if ((w.type === "clock" || w.type === "date") && !("showBackground" in w)) {
            w.showBackground = false;
          }
          if (w.type === "shopping") {
            if (!("allowAdd" in w)) w.allowAdd = false;
            if (!("allowCheck" in w)) w.allowCheck = false;
          }
          if (w.type === "messages" && !("allowAdd" in w)) w.allowAdd = false;
          if (w.type === "tasks" && !("provider" in w)) w.provider = "google";
          return w;
        }),
      };
    });
  }
  // Append built-in schemes added after this document was saved (edited copies keep their id and are left alone).
  if (Array.isArray(out.themes)) {
    const have = new Set(
      out.themes.map((t) => (typeof t === "object" && t !== null && "id" in t ? String((t as { id: unknown }).id) : "")),
    );
    const room = 30 - out.themes.length;
    if (room > 0) {
      const missing = (d.themes as { id: string }[]).filter((t) => !have.has(t.id)).slice(0, room);
      if (missing.length > 0) out.themes = [...out.themes, ...structuredClone(missing)];
    }
  }
  return out;
}
