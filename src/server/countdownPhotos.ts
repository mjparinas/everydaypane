import "server-only";

import type { DashboardConfig } from "@/lib/config/schema";

import { query } from "./db";
import { libraryImage, removePhotos } from "./library";

// Photos on birthdays and anniversaries (Melvin, 2026-11-26: "birthdays and anniversaries with a countdown and a
// photo"). They live in the photo library's private Blob store under one reserved source id per household, never in a
// photos widget's albums, and are uploaded already shrunk to about 800 px. A display gets one only through
// /api/display/countdown-photo/ and only while a countdown widget in the saved settings names it; the admin's live
// preview may show any of the household's own, so a photo appears before Publish.

export const COUNTDOWN_SOURCE = "countdown";
export const COUNTDOWN_PHOTO_SIDE = 800;
/** Unreferenced photos are kept a day, so one uploaded but not yet published survives a save from another tab. */
const ORPHAN_GRACE_MS = 24 * 3600_000;

export function countdownPhotoIds(config: DashboardConfig): Set<string> {
  const ids = new Set<string>();
  for (const view of config.views) {
    for (const w of view.widgets) {
      if (w.type !== "countdown") continue;
      for (const e of w.events) if (e.photo) ids.add(e.photo);
    }
  }
  return ids;
}

async function pathnameOf(accountId: string, id: string): Promise<string | null> {
  const [row] = await query<{ pathname: string }>("SELECT pathname FROM photos WHERE account_id = ? AND source_id = ? AND id = ?", [
    accountId,
    COUNTDOWN_SOURCE,
    id,
  ]);
  return row?.pathname ?? null;
}

export async function countdownPhoto(accountId: string, config: DashboardConfig, id: string, preview: boolean): Promise<Response | null> {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) return null;
  if (!preview && !countdownPhotoIds(config).has(id)) return null;
  const pathname = await pathnameOf(accountId, id);
  return pathname ? libraryImage(pathname) : null;
}

/** Deletes countdown photos no countdown widget names any more (after the grace period). Returns how many went. */
export async function pruneCountdownPhotos(accountId: string, config: DashboardConfig, now = Date.now()): Promise<number> {
  const keep = countdownPhotoIds(config);
  const rows = await query<{ id: string }>("SELECT id FROM photos WHERE account_id = ? AND source_id = ? AND added_at < ?", [
    accountId,
    COUNTDOWN_SOURCE,
    now - ORPHAN_GRACE_MS,
  ]);
  let removed = 0;
  for (const r of rows) if (!keep.has(r.id)) removed += await removePhotos(accountId, COUNTDOWN_SOURCE, r.id);
  return removed;
}
