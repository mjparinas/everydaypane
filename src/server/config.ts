import "server-only";

import { defaultConfig } from "@/lib/config/defaults";
import { configSchema, type DashboardConfig } from "@/lib/config/schema";

import { query, run } from "./db";
import { publicHaUrl, sameHaUrl } from "./haUrl";
import { removePhotos } from "./library";
import { setSecret } from "./secrets";

export interface StoredConfig {
  config: DashboardConfig;
  version: number;
  updatedAt: number;
}

/** The saved dashboard, or the default one before the first save. A stored document that no longer validates
 *  (after a schema change) is upgraded by filling defaults; if even that fails, the default is served. */
export async function loadConfig(): Promise<StoredConfig> {
  const rows = await query<{ json: string; version: number; updated_at: number }>(
    "SELECT json, version, updated_at FROM config WHERE id = 1",
  );
  const row = rows[0];
  if (!row) return { config: defaultConfig(), version: 0, updatedAt: 0 };
  const parsed = configSchema.safeParse(upgrade(JSON.parse(row.json) as unknown));
  return { config: parsed.success ? parsed.data : defaultConfig(), version: Number(row.version), updatedAt: Number(row.updated_at) };
}

export async function configVersion(): Promise<number> {
  const rows = await query<{ version: number }>("SELECT version FROM config WHERE id = 1");
  return Number(rows[0]?.version ?? 0);
}

export type SaveResult = { ok: true; version: number } | { ok: false; status: 409 | 422; error: string; issues?: unknown };

/**
 * Saves the whole document if `baseVersion` is still the latest (so two admin tabs can't silently overwrite each
 * other), bumping the version every display polls for.
 */
export async function saveConfig(input: unknown, baseVersion: number, now = Date.now()): Promise<SaveResult> {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) return { ok: false, status: 422, error: "The dashboard settings aren't valid", issues: parsed.error.issues };
  const haUrl = parsed.data.integrations.homeAssistant.url;
  if (haUrl && !publicHaUrl(haUrl)) {
    return { ok: false, status: 422, error: "Home Assistant needs a public https address." };
  }
  const previous = await loadConfig();
  const json = JSON.stringify(parsed.data);
  let version: number | null = null;
  if (baseVersion === 0) {
    const inserted = await run("INSERT INTO config (id, json, version, updated_at) VALUES (1, ?, 1, ?) ON CONFLICT (id) DO NOTHING", [
      json,
      now,
    ]);
    if (inserted === 1) version = 1;
  } else {
    const updated = await run("UPDATE config SET json = ?, version = version + 1, updated_at = ? WHERE id = 1 AND version = ?", [
      json,
      now,
      baseVersion,
    ]);
    if (updated === 1) version = baseVersion + 1;
  }
  if (version === null) return { ok: false, status: 409, error: "Someone else changed the dashboard. Reload to see their changes." };
  // Changing a set HA address must not keep sending the stored token to a new host (backup restore or a pasted URL).
  const prevHa = previous.config.integrations.homeAssistant.url;
  if (prevHa && !sameHaUrl(prevHa, haUrl)) {
    await setSecret("homeAssistant.token", null, now);
    await setSecret("homeAssistant.accessId", null, now);
    await setSecret("homeAssistant.accessSecret", null, now);
  }
  // A library album leaves the document only when Save lands, so Undo still has its photos. The blobs go with it then.
  const kept = new Set(parsed.data.integrations.photos.sources.filter((s) => s.kind === "library").map((s) => s.id));
  for (const source of previous.config.integrations.photos.sources) {
    if (source.kind === "library" && !kept.has(source.id)) await removePhotos(source.id);
  }
  return { ok: true, version };
}

/** Bumps the version without changing the document, so displays reload (e.g. after a device is reassigned). */
export async function touchConfig(now = Date.now()): Promise<void> {
  const changed = await run("UPDATE config SET version = version + 1, updated_at = ? WHERE id = 1", [now]);
  if (changed === 0)
    await run("INSERT INTO config (id, json, version, updated_at) VALUES (1, ?, 1, ?)", [JSON.stringify(defaultConfig()), now]);
}

/** Fills in sections added after a document was saved, from the defaults. */
export function upgrade(stored: unknown): unknown {
  if (typeof stored !== "object" || stored === null) return stored;
  const d = defaultConfig() as unknown as Record<string, unknown>;
  const s = stored as Record<string, unknown>;
  const out: Record<string, unknown> = { ...d, ...s };
  for (const k of ["integrations", "burnIn", "alerts", "schedule", "location", "school"]) {
    if (typeof s[k] === "object" && s[k] !== null) out[k] = { ...(d[k] as object), ...(s[k] as object) };
  }
  // Per-widget panel (Melvin, 2026-11-22): sunrise & sunset used to have its own `transparent` flag; clocks and
  // dates had no panel in CSS. Map those into showBackground so older documents keep looking the same.
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
