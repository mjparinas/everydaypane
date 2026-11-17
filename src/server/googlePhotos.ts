import "server-only";

import { z } from "zod";

import { accessToken, photosGranted } from "./google";
import { addPhoto, MAX_SIDE } from "./library";

// Google Photos through Google's Picker API (Melvin, 2026-11-17). The admin opens Google's own picker in a new window,
// picks photos, and the admin panel then asks us to copy them, a page at a time, into a library album. Google's links
// to the pictures last 60 minutes and need our token, so photos are copied rather than linked.

const API = "https://photospicker.googleapis.com/v1";

export class PhotosNotAllowed extends Error {
  constructor() {
    super("Connect Google Photos first");
  }
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  if (!(await photosGranted())) throw new PhotosNotAllowed();
  const token = await accessToken();
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (r.status === 401 || r.status === 403) {
    const body = await r.text().catch(() => "");
    console.error(`[google-photos] ${r.status} for ${path.split("?")[0]}: ${body.slice(0, 300)}`);
    if (/SERVICE_DISABLED|has not been used|is disabled/i.test(body))
      throw new Error("Turn on the Google Photos Picker API in Google Cloud");
    throw new PhotosNotAllowed();
  }
  if (!r.ok) {
    console.error(`[google-photos] ${r.status} for ${path.split("?")[0]}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
    throw new Error(`Google Photos answered ${r.status}`);
  }
  return r;
}

const sessionSchema = z.object({
  id: z.string(),
  pickerUri: z.string().optional(),
  mediaItemsSet: z.boolean().optional(),
  pollingConfig: z.object({ pollInterval: z.string().optional(), timeoutIn: z.string().optional() }).optional(),
});

const seconds = (d?: string) => (d ? Number.parseFloat(d) : Number.NaN);

export interface PickerSession {
  id: string;
  pickerUri: string | null;
  ready: boolean;
  pollMs: number;
}

function trimSession(raw: unknown): PickerSession {
  const s = sessionSchema.parse(raw);
  const poll = seconds(s.pollingConfig?.pollInterval);
  return {
    id: s.id,
    // /autoclose closes Google's window once the photos are picked.
    pickerUri: s.pickerUri ? `${s.pickerUri.replace(/\/+$/, "")}/autoclose` : null,
    ready: s.mediaItemsSet === true,
    pollMs: Number.isFinite(poll) ? Math.min(30_000, Math.max(2000, poll * 1000)) : 4000,
  };
}

export async function createSession(): Promise<PickerSession> {
  return trimSession(await (await call("/sessions", { method: "POST", body: "{}" })).json());
}

const sessionId = (id: string) => {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new Error("Bad session");
  return id;
};

export async function getSession(id: string): Promise<PickerSession> {
  return trimSession(await (await call(`/sessions/${sessionId(id)}`)).json());
}

export async function deleteSession(id: string): Promise<void> {
  await call(`/sessions/${sessionId(id)}`, { method: "DELETE" }).catch(() => undefined);
}

const itemSchema = z.object({
  id: z.string(),
  createTime: z.string().optional(),
  type: z.string().optional(),
  mediaFile: z
    .object({
      baseUrl: z.string(),
      mimeType: z.string().optional(),
      mediaFileMetadata: z.object({ width: z.coerce.number().optional(), height: z.coerce.number().optional() }).optional(),
    })
    .optional(),
});
const pageSchema = z.object({ mediaItems: z.array(z.unknown()).default([]), nextPageToken: z.string().optional() });

/** The size Google sends for "=w2048-h2048": the original scaled down to fit, never up. */
export function fitted(w: number, h: number, max = MAX_SIDE): { w: number; h: number } {
  if (!(w > 0 && h > 0)) return { w: 0, h: 0 };
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

export interface ImportResult {
  added: number;
  skipped: number;
  next: string | null;
}

/** Copies one page (up to 20) of the picked photos into a library album. Videos are skipped. */
export async function importPage(sourceId: string, session: string, pageToken: string | null): Promise<ImportResult> {
  const q = new URLSearchParams({ sessionId: sessionId(session), pageSize: "20" });
  if (pageToken) q.set("pageToken", pageToken);
  const page = pageSchema.parse(await (await call(`/mediaItems?${q}`)).json());
  const token = await accessToken();
  let added = 0;
  let skipped = 0;
  for (const raw of page.mediaItems) {
    const item = itemSchema.safeParse(raw);
    const file = item.success ? item.data.mediaFile : undefined;
    if (
      !item.success ||
      !file ||
      (item.data.type && item.data.type !== "PHOTO") ||
      !/^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//.test(file.baseUrl)
    ) {
      skipped++;
      continue;
    }
    const r = await fetch(`${file.baseUrl}=w${MAX_SIDE}-h${MAX_SIDE}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) {
      console.error(`[google-photos] picture answered ${r.status}`);
      skipped++;
      continue;
    }
    const size = fitted(file.mediaFileMetadata?.width ?? 0, file.mediaFileMetadata?.height ?? 0);
    const result = await addPhoto(sourceId, new Uint8Array(await r.arrayBuffer()), {
      w: size.w,
      h: size.h,
      taken: item.data.createTime ?? null,
      origin: "google",
      originId: item.data.id,
    });
    if (result.ok) added++;
    else skipped++;
  }
  return { added, skipped, next: page.nextPageToken ?? null };
}
