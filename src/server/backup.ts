import "server-only";

import { z } from "zod";

import { configSchema, type DashboardConfig } from "@/lib/config/schema";

import { upgrade, type StoredConfig } from "./config";

// Settings backup and restore (Melvin, 2026-11-21): the admin downloads the whole settings document (views, widgets,
// themes, schedule, integration settings) as one JSON file and can restore it later. The file is the document itself,
// walked generically, so a widget type added later is in every backup without touching this file.
//
// What a backup never holds: the secrets table (Google, Spotify and Sonos refresh tokens, the Amazon cookie, Home
// Assistant's token and Access pair, calendar link addresses), display devices and their addresses, meals, the message
// board, the whiteboard doodle and photo library files. Those stay on the server; after restoring onto a fresh install
// they are connected again from Settings. The WiFi password is the one secret inside the document: it is left out
// unless the admin asks for it, and a restore without it keeps the password the dashboard already has.

export const BACKUP_KIND = "everydaypane-settings";
export const BACKUP_FORMAT = 1;

/** What is never in a backup, written into the file so whoever opens it knows. */
export const NOT_IN_BACKUP =
  "Sign-ins and tokens (Google, Spotify, Sonos, Amazon, Home Assistant), calendar link addresses, display addresses, " +
  "meals, family messages, the whiteboard doodle and photo library files are not in this file. Connect them again from Settings after restoring.";

export interface Backup {
  kind: typeof BACKUP_KIND;
  format: number;
  exportedAt: string;
  version: number;
  wifiPasswords: "included" | "left out";
  notIncluded: string;
  config: DashboardConfig;
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** Every `password` string anywhere in the document, blanked. Generic, so a future widget's password is covered too. */
function blankPasswords(value: Json): Json {
  if (Array.isArray(value)) return value.map(blankPasswords);
  if (value === null || typeof value !== "object") return value;
  const out: { [k: string]: Json } = {};
  for (const [k, v] of Object.entries(value)) out[k] = k === "password" && typeof v === "string" ? "" : blankPasswords(v);
  return out;
}

export function makeBackup(stored: StoredConfig, opts: { wifiPasswords: boolean }, now = new Date()): Backup {
  const doc = JSON.parse(JSON.stringify(stored.config)) as Json;
  return {
    kind: BACKUP_KIND,
    format: BACKUP_FORMAT,
    exportedAt: now.toISOString(),
    version: stored.version,
    wifiPasswords: opts.wifiPasswords ? "included" : "left out",
    notIncluded: NOT_IN_BACKUP,
    config: (opts.wifiPasswords ? doc : blankPasswords(doc)) as unknown as DashboardConfig,
  };
}

export const backupFileName = (now = new Date()) => `everydaypane-settings-${now.toISOString().slice(0, 10)}.json`;

const envelope = z.object({
  kind: z.literal(BACKUP_KIND),
  format: z.number().int().min(1),
  wifiPasswords: z.enum(["included", "left out"]).optional(),
  config: z.unknown(),
});

export type RestoreParse =
  | { ok: true; config: DashboardConfig; summary: { views: number; widgets: number; themes: number } }
  | { ok: false; error: string; issues?: unknown };

/**
 * Checks an uploaded backup and turns it into a settings document. Older backups are upgraded the same way a stored
 * document is (sections added since are filled from the defaults). WiFi passwords left out of the file are taken from
 * `current`, matched by widget id and then by network name, so restoring never blanks the QR code.
 */
export function readBackup(input: unknown, current: DashboardConfig): RestoreParse {
  const env = envelope.safeParse(input);
  if (!env.success) return { ok: false, error: "That isn't an Everydaypane settings backup." };
  if (env.data.format > BACKUP_FORMAT)
    return { ok: false, error: "This backup is from a newer version of Everydaypane. Update first, then restore." };
  const parsed = configSchema.safeParse(upgrade(env.data.config));
  if (!parsed.success) return { ok: false, error: "The backup's settings aren't valid.", issues: parsed.error.issues };
  const config = parsed.data;
  if (env.data.wifiPasswords !== "included") keepWifiPasswords(config, current);
  const widgets = config.views.reduce((n, v) => n + v.widgets.length, 0);
  return { ok: true, config, summary: { views: config.views.length, widgets, themes: config.themes.length } };
}

function keepWifiPasswords(config: DashboardConfig, current: DashboardConfig): void {
  const byId = new Map<string, string>();
  const bySsid = new Map<string, string>();
  for (const w of current.views.flatMap((v) => v.widgets)) {
    if (w.type !== "wifiQr" || !w.password) continue;
    byId.set(w.id, w.password);
    if (!bySsid.has(w.ssid)) bySsid.set(w.ssid, w.password);
  }
  for (const w of config.views.flatMap((v) => v.widgets)) {
    if (w.type === "wifiQr" && !w.password) w.password = byId.get(w.id) ?? bySsid.get(w.ssid) ?? "";
  }
}
