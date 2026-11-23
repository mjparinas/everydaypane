import "server-only";

import { cached } from "../cache";
import { boxAccessToken, boxConfigured } from "../photoAuth";
import { MAX_PHOTOS, type Listed } from "./types";

const TTL = 30 * 60_000;

interface BoxItem {
  id?: string;
  name?: string;
  type?: string;
}

export async function listBox(accountId: string, folderId: string, now = Date.now()): Promise<Listed[]> {
  if (!boxConfigured()) throw new Error("BOX_CLIENT_ID and BOX_CLIENT_SECRET aren't set");
  const token = await boxAccessToken(accountId);
  const folder = folderId || "0";
  const result = await cached(
    `photos:box:${accountId}:${folder}`,
    TTL,
    async () => {
      const r = await fetch(`https://api.box.com/2.0/folders/${encodeURIComponent(folder)}/items?limit=200&fields=id,name,type`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (r.status === 401) throw new Error("Box needs to be connected again");
      if (!r.ok) throw new Error(`Box answered ${r.status}`);
      const body = (await r.json()) as { entries?: BoxItem[] };
      const photos: Listed[] = [];
      for (const e of body.entries ?? []) {
        if (e.type !== "file" || !e.id || !e.name || !/\.(jpe?g|png|gif|webp)$/i.test(e.name)) continue;
        photos.push({ id: e.id, url: `box:${e.id}`, w: 0, h: 0, taken: null });
        if (photos.length >= MAX_PHOTOS) break;
      }
      if (!photos.length) throw new Error("This Box folder has no photos");
      return photos;
    },
    now,
  );
  return result.value;
}

export async function boxImage(accountId: string, fileId: string): Promise<Response> {
  const token = await boxAccessToken(accountId);
  return fetch(`https://api.box.com/2.0/files/${encodeURIComponent(fileId)}/content`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
}
