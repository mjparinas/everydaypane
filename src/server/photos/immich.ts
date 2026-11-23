import "server-only";

import { cached } from "../cache";
import { getSecret } from "../secrets";
import { MAX_PHOTOS, type Listed } from "./types";

const TTL = 30 * 60_000;

function base(url: string): string {
  const u = new URL(url);
  u.pathname = u.pathname.replace(/\/$/, "");
  return u.origin + u.pathname;
}

function trim(raw: unknown, origin: string): Listed[] {
  const rows = (
    raw as {
      assets?: {
        id?: string;
        originalFileName?: string;
        fileCreatedAt?: string;
        exifInfo?: { exifImageWidth?: number; exifImageHeight?: number };
      }[];
    }
  ).assets;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((a) => a.id)
    .slice(0, MAX_PHOTOS)
    .map((a) => ({
      id: a.id!,
      url: `${origin}/api/assets/${encodeURIComponent(a.id!)}/thumbnail?size=preview`,
      w: Number(a.exifInfo?.exifImageWidth) || 0,
      h: Number(a.exifInfo?.exifImageHeight) || 0,
      taken: a.fileCreatedAt?.slice(0, 10) ?? null,
    }));
}

export async function listImmich(accountId: string, sourceId: string, baseUrl: string, now = Date.now()): Promise<Listed[]> {
  const key = await getSecret(accountId, `immich.${sourceId}`);
  if (!key) throw new Error("Add the Immich API key in Settings › Photos");
  const origin = base(baseUrl);
  const result = await cached(
    `photos:immich:${sourceId}:${origin}`,
    TTL,
    async () => {
      const r = await fetch(`${origin}/api/search/metadata?size=${MAX_PHOTOS}`, {
        headers: { "x-api-key": key, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (r.status === 401 || r.status === 403) throw new Error("Immich refused the API key");
      if (!r.ok) throw new Error(`Immich answered ${r.status}`);
      const photos = trim(await r.json(), origin);
      if (!photos.length) throw new Error("Immich returned no photos");
      return photos;
    },
    now,
  );
  return result.value;
}

/** Fetches full-size or preview bytes for the proxy. */
export async function immichImage(accountId: string, sourceId: string, baseUrl: string, photoId: string, width: number): Promise<Response> {
  const key = await getSecret(accountId, `immich.${sourceId}`);
  if (!key) return new Response(null, { status: 404 });
  const origin = base(baseUrl);
  const size = width >= 1200 ? "preview" : "thumbnail";
  const r = await fetch(`${origin}/api/assets/${encodeURIComponent(photoId)}/thumbnail?size=${size}`, {
    headers: { "x-api-key": key },
    signal: AbortSignal.timeout(20_000),
  });
  return r;
}
