import "server-only";

import { del, get, put } from "@vercel/blob";

import { randomToken } from "./crypto";
import { query, run } from "./db";

// The photo library (Melvin, 2026-11-17, after Amazon turned our server away): photos uploaded from the admin panel or
// picked in Google Photos, kept in a private Vercel Blob store (everydaypane-photos, BLOB_READ_WRITE_TOKEN) with a row
// each in the photos table. Pictures are stored once at no more than 2048 px on the long side as JPEG (uploads are
// shrunk in the admin's browser, Google sends that size), which is plenty for a 1920 × 1080 screen. Blobs are private:
// a display only ever gets them through our photo route.

export const MAX_SIDE = 2048;
export const MAX_BYTES = 4 * 1024 * 1024;
export const MAX_PER_SOURCE = 3000;

export interface LibraryPhoto {
  id: string;
  pathname: string;
  w: number;
  h: number;
  taken: string | null;
  origin: "upload" | "google";
}

export const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

/** JPEG, PNG or WebP by the first bytes; anything else isn't stored. */
export function storedType(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export type AddResult = { ok: true; photo: LibraryPhoto } | { ok: false; reason: string };

export async function addPhoto(
  accountId: string,
  sourceId: string,
  bytes: Uint8Array,
  meta: { w: number; h: number; taken?: string | null; origin: "upload" | "google"; originId?: string },
  now = Date.now(),
): Promise<AddResult> {
  const type = storedType(bytes);
  if (!type) return { ok: false, reason: "Not a JPEG, PNG or WebP picture" };
  if (bytes.byteLength > MAX_BYTES) return { ok: false, reason: "Bigger than 4 MB" };
  if (meta.originId) {
    const dup = await query("SELECT id FROM photos WHERE account_id = ? AND source_id = ? AND origin_id = ?", [
      accountId,
      sourceId,
      meta.originId,
    ]);
    if (dup.length) return { ok: false, reason: "Already added" };
  }
  const [count] = await query<{ n: number }>("SELECT COUNT(*) AS n FROM photos WHERE account_id = ? AND source_id = ?", [
    accountId,
    sourceId,
  ]);
  if (Number(count?.n ?? 0) >= MAX_PER_SOURCE) return { ok: false, reason: `This album is full (${MAX_PER_SOURCE} photos)` };

  const id = randomToken(12);
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const pathname = `photos/${sourceId}/${id}.${ext}`;
  await put(pathname, Buffer.from(bytes), { access: "private", contentType: type, addRandomSuffix: false });
  const photo: LibraryPhoto = {
    id,
    pathname,
    w: Math.max(0, Math.round(meta.w)),
    h: Math.max(0, Math.round(meta.h)),
    taken: meta.taken && /^\d{4}-\d{2}-\d{2}/.test(meta.taken) ? meta.taken.slice(0, 10) : null,
    origin: meta.origin,
  };
  await run(
    "INSERT INTO photos (id, account_id, source_id, pathname, w, h, taken, origin, origin_id, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      accountId,
      sourceId,
    pathname,
    photo.w,
    photo.h,
    photo.taken,
    photo.origin,
    meta.originId ?? null,
    now,
  ]);
  return { ok: true, photo };
}

export async function listLibrary(accountId: string, sourceId: string): Promise<LibraryPhoto[]> {
  const rows = await query<{ id: string; pathname: string; w: number; h: number; taken: string | null; origin: string }>(
    "SELECT id, pathname, w, h, taken, origin FROM photos WHERE account_id = ? AND source_id = ? ORDER BY added_at DESC LIMIT ?",
    [accountId, sourceId, MAX_PER_SOURCE],
  );
  return rows.map((r) => ({
    id: r.id,
    pathname: r.pathname,
    w: Number(r.w),
    h: Number(r.h),
    taken: r.taken,
    origin: r.origin === "google" ? "google" : "upload",
  }));
}

/** A stored picture, straight from the private store. */
export async function libraryImage(pathname: string): Promise<Response | null> {
  const r = await get(pathname, { access: "private" });
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  return new Response(r.stream, {
    headers: {
      "Content-Type": r.blob.contentType ?? "image/jpeg",
      "Cache-Control": "private, max-age=604800, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Removes one photo, or with no id every photo of a source. */
export async function removePhotos(accountId: string, sourceId: string, photoId?: string): Promise<number> {
  const rows = await query<{ id: string; pathname: string }>(
    photoId
      ? "SELECT id, pathname FROM photos WHERE account_id = ? AND source_id = ? AND id = ?"
      : "SELECT id, pathname FROM photos WHERE account_id = ? AND source_id = ?",
    photoId ? [accountId, sourceId, photoId] : [accountId, sourceId],
  );
  if (!rows.length) return 0;
  for (let i = 0; i < rows.length; i += 100) await del(rows.slice(i, i + 100).map((r) => r.pathname));
  await run(
    photoId
      ? "DELETE FROM photos WHERE account_id = ? AND source_id = ? AND id = ?"
      : "DELETE FROM photos WHERE account_id = ? AND source_id = ?",
    photoId ? [accountId, sourceId, photoId] : [accountId, sourceId],
  );
  return rows.length;
}
