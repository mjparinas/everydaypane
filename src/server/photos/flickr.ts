import "server-only";

import { z } from "zod";

import { cached } from "../cache";
import { env } from "../env";
import { flickrAccessToken, flickrConfigured } from "../photoAuth";
import { fetchPublicHttps } from "../publicUrl";
import { MAX_PHOTOS, type Listed } from "./types";

const TTL = 30 * 60_000;

const photoSchema = z.object({
  photoset: z.object({
    photo: z
      .array(
        z.object({
          id: z.string(),
          secret: z.string(),
          server: z.string(),
          farm: z.number(),
          title: z.string().optional(),
        }),
      )
      .default([]),
  }),
});

function photoUrl(p: { id: string; secret: string; server: string; farm: number }): string {
  return `https://live.staticflickr.com/${p.farm}/${p.server}/${p.id}_${p.secret}_b.jpg`;
}

function trim(raw: unknown): Listed[] {
  const parsed = photoSchema.safeParse(raw);
  if (!parsed.success) return [];
  return parsed.data.photoset.photo.slice(0, MAX_PHOTOS).map((p) => ({
    id: p.id,
    url: photoUrl(p),
    w: 0,
    h: 0,
    taken: null,
  }));
}

export async function listFlickr(accountId: string, userId: string, photosetId: string, now = Date.now()): Promise<Listed[]> {
  if (!flickrConfigured()) throw new Error("FLICKR_API_KEY isn't set");
  const key = `photos:flickr:${userId}:${photosetId}`;
  const result = await cached(
    key,
    TTL,
    async () => {
      const params = new URLSearchParams({
        method: photosetId ? "flickr.photosets.getPhotos" : "flickr.people.getPublicPhotos",
        api_key: env.flickrApiKey(),
        photoset_id: photosetId,
        user_id: userId,
        per_page: String(Math.min(MAX_PHOTOS, 200)),
        format: "json",
        nojsoncallback: "1",
      });
      const oauth = await flickrAccessToken(accountId);
      if (oauth) params.set("oauth_token", oauth);
      const r = await fetchPublicHttps(`https://www.flickr.com/services/rest/?${params}`, { signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw new Error(`Flickr answered ${r.status}`);
      const photos = trim(await r.json());
      if (!photos.length) throw new Error("Flickr returned no photos — check the user and album ids");
      return photos;
    },
    now,
  );
  return result.value;
}
