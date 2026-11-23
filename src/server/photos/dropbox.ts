import "server-only";

import { cached } from "../cache";
import { dropboxAccessToken } from "../photoAuth";
import { MAX_PHOTOS, type Listed } from "./types";

const TTL = 30 * 60_000;

interface DropboxEntry {
  ".tag"?: string;
  id?: string;
  name?: string;
  path_display?: string;
  client_modified?: string;
}

function trim(entries: DropboxEntry[]): Listed[] {
  const out: Listed[] = [];
  for (const e of entries) {
    if (e[".tag"] !== "file" || !e.id || !e.name) continue;
    if (!/\.(jpe?g|png|gif|webp|avif)$/i.test(e.name)) continue;
    const path = e.path_display ?? e.id ?? "";
    out.push({
      id: path,
      url: `dropbox:${encodeURIComponent(path)}`,
      w: 0,
      h: 0,
      taken: e.client_modified?.slice(0, 10) ?? null,
    });
    if (out.length >= MAX_PHOTOS) break;
  }
  return out;
}

export async function listDropbox(accountId: string, path: string, now = Date.now()): Promise<Listed[]> {
  const token = await dropboxAccessToken(accountId);
  const folder = path.trim() || "";
  const result = await cached(
    `photos:dropbox:${accountId}:${folder}`,
    TTL,
    async () => {
      const r = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ path: folder, recursive: true, include_media_info: false, limit: MAX_PHOTOS }),
        signal: AbortSignal.timeout(20_000),
      });
      if (r.status === 401) throw new Error("Dropbox needs to be connected again");
      if (!r.ok) throw new Error(`Dropbox answered ${r.status}`);
      const body = (await r.json()) as { entries?: DropboxEntry[] };
      const photos = trim(body.entries ?? []);
      if (!photos.length) throw new Error("This Dropbox folder has no photos");
      return photos;
    },
    now,
  );
  return result.value;
}

export async function dropboxImage(accountId: string, path: string): Promise<Response> {
  const token = await dropboxAccessToken(accountId);
  return fetch("https://content.dropboxapi.com/2/files/get_thumbnail_v2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Dropbox-API-Arg": JSON.stringify({ resource: { ".tag": "path", path }, format: "jpeg", size: "w1024h768" }),
      "Content-Type": "application/octet-stream",
    },
    signal: AbortSignal.timeout(20_000),
  });
}
