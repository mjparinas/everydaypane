import "server-only";

import { cached } from "../cache";
import { smugmugAccessToken, smugmugConfigured } from "../photoAuth";
import { MAX_PHOTOS, type Listed } from "./types";

const TTL = 30 * 60_000;

interface SmugImage {
  ImageKey?: string;
  ArchivedUri?: string;
  Date?: string;
  Uri?: string;
  IsVideo?: boolean;
}

function trim(images: SmugImage[]): Listed[] {
  return images
    .filter((i) => i.ImageKey && i.ArchivedUri && !i.IsVideo)
    .slice(0, MAX_PHOTOS)
    .map((i) => ({
      id: i.ImageKey!,
      url: `${i.ArchivedUri}!L.jpg`,
      w: 0,
      h: 0,
      taken: i.Date?.slice(0, 10) ?? null,
    }));
}

export async function listSmugmug(accountId: string, albumKey: string, now = Date.now()): Promise<Listed[]> {
  if (!smugmugConfigured()) throw new Error("SMUGMUG_API_KEY isn't set");
  if (!albumKey.trim()) throw new Error("Add the SmugMug album key");
  const token = await smugmugAccessToken(accountId);
  const result = await cached(
    `photos:smugmug:${accountId}:${albumKey}`,
    TTL,
    async () => {
      const r = await fetch(`https://api.smugmug.com/api/v2/album/${encodeURIComponent(albumKey)}!images`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (r.status === 401) throw new Error("SmugMug needs to be connected again");
      if (!r.ok) throw new Error(`SmugMug answered ${r.status}`);
      const body = (await r.json()) as { Response?: { AlbumImage?: SmugImage[] } };
      const photos = trim(body.Response?.AlbumImage ?? []);
      if (!photos.length) throw new Error("SmugMug returned no photos");
      return photos;
    },
    now,
  );
  return result.value;
}
