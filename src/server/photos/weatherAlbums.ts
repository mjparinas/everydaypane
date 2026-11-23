import "server-only";

import type { DashboardConfig, PhotoSource } from "@/lib/config/schema";

import { listLibrary } from "../library";
import { weather } from "../weather";
import type { Listed } from "./types";

function listUrls(urls: string[]): Listed[] {
  return urls.map((url, i) => ({ id: `w${i}`, url, w: 0, h: 0, taken: null }));
}

async function libraryPhotos(accountId: string, albumId: string): Promise<Listed[]> {
  return (await listLibrary(accountId, albumId)).map((p) => ({ id: p.id, url: p.pathname, w: p.w, h: p.h, taken: p.taken }));
}

/** Picks bucket photos from today's weather code (Open-Meteo). */
export async function listWeatherAlbums(
  accountId: string,
  config: DashboardConfig,
  source: Extract<PhotoSource, { kind: "weatherAlbums" }>,
): Promise<Listed[]> {
  const wx = await weather(config);
  const code = wx.value.current.code;
  const bucket = source.buckets.find((b) => b.codes.includes(code)) ?? source.buckets.find((b) => b.codes.length === 0) ?? null;
  if (bucket?.libraryAlbumId) return libraryPhotos(accountId, bucket.libraryAlbumId);
  if (bucket?.urls?.length) return listUrls(bucket.urls);
  if (source.fallbackUrls.length) return listUrls(source.fallbackUrls);
  throw new Error("No photo bucket matches today's weather");
}
