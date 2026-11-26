"use client";

import { useCallback, useEffect, useState } from "react";

import type { DashboardConfig } from "@/lib/config/schema";

import { useAdmin } from "./store";

// One library album in Settings › Photos: its photos as small thumbnails, uploads from this phone or computer, and
// picking from Google Photos. Pictures are shrunk here, in the browser, to at most 2048 px JPEG before they're sent,
// so a 12 MB phone photo goes up as a few hundred KB and fits Vercel's request limit.

interface Item {
  id: string;
  w: number;
  h: number;
  taken: string | null;
  origin: "upload" | "google";
}

const MAX_SIDE = 2048;

export async function shrink(file: File, maxSide = MAX_SIDE): Promise<{ blob: Blob; w: number; h: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * k));
  const h = Math.max(1, Math.round(bitmap.height * k));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!blob) throw new Error("Couldn't read that picture");
  return { blob, w, h };
}

async function fetchLibrary(sourceId: string): Promise<{ storage: boolean; photos: Item[] }> {
  const r = await fetch(`/api/household/library/?source=${encodeURIComponent(sourceId)}`).catch(() => null);
  if (!r?.ok) return { storage: true, photos: [] };
  return (await r.json()) as { storage: boolean; photos: Item[] };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function LibraryAlbum({ sourceId }: { sourceId: string }) {
  const saved = useAdmin((s) => (JSON.parse(s.saved) as DashboardConfig).integrations.photos.sources.some((x) => x.id === sourceId));
  const [items, setItems] = useState<Item[] | null>(null);
  const [storage, setStorage] = useState(true);
  const [google, setGoogle] = useState<{ allowed: boolean } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const apply = useCallback((body: { storage: boolean; photos: Item[] }) => {
    setStorage(body.storage);
    setItems(body.photos);
  }, []);
  const load = useCallback(async () => apply(await fetchLibrary(sourceId)), [apply, sourceId]);

  useEffect(() => {
    if (!saved) return;
    let live = true;
    fetchLibrary(sourceId)
      .then((body) => live && apply(body))
      .catch(() => undefined);
    fetch("/api/household/google-photos/")
      .then((r) => (r.ok ? (r.json() as Promise<{ allowed: boolean }>) : null))
      .then((g) => live && setGoogle(g))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [saved, sourceId, apply]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    const list = [...files].filter((f) => f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
    let failed = 0;
    for (const [i, file] of list.entries()) {
      setBusy(`Uploading ${i + 1} of ${list.length}…`);
      try {
        const { blob, w, h } = await shrink(file);
        const r = await fetch(`/api/household/library/?source=${encodeURIComponent(sourceId)}`, {
          method: "POST",
          headers: { "Content-Type": "image/jpeg", "x-photo-width": String(w), "x-photo-height": String(h) },
          body: blob,
        });
        if (!r.ok) failed++;
      } catch {
        failed++;
      }
    }
    setBusy("");
    if (failed) setError(`${failed} of ${list.length} couldn't be uploaded.`);
    await load();
  }

  async function pickFromGoogle() {
    setError("");
    // Opened now, while the tap still counts, so the browser doesn't block it; pointed at Google once the session exists.
    const win = window.open("about:blank", "_blank");
    const start = await fetch("/api/household/google-photos/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: true }),
    }).catch(() => null);
    const s = (await start?.json().catch(() => ({}))) as { session?: string; pickerUri?: string; pollMs?: number; error?: string };
    if (!start?.ok || !s.session || !s.pickerUri) {
      win?.close();
      return setError(s.error ?? "Couldn't open Google Photos.");
    }
    if (win) win.location.href = s.pickerUri;
    else window.open(s.pickerUri, "_blank");
    const session = s.session;
    const end = () => void fetch(`/api/household/google-photos/?session=${encodeURIComponent(session)}`, { method: "DELETE" });
    try {
      setBusy("Pick photos in the Google Photos window, then tap Done there…");
      const until = Date.now() + 30 * 60_000;
      let ready = false;
      while (!ready && Date.now() < until) {
        await wait(s.pollMs ?? 4000);
        const r = await fetch(`/api/household/google-photos/?session=${encodeURIComponent(session)}`);
        const body = (await r.json().catch(() => ({}))) as { ready?: boolean; error?: string };
        if (!r.ok) throw new Error(body.error ?? "Google Photos stopped answering");
        ready = body.ready === true;
      }
      if (!ready) throw new Error("No photos were picked in time.");
      let page: string | null = null;
      let added = 0;
      let skipped = 0;
      do {
        setBusy(`Copying from Google Photos… ${added} so far`);
        const r = await fetch("/api/household/google-photos/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: sourceId, session, page }),
        });
        const body = (await r.json().catch(() => ({}))) as { added?: number; skipped?: number; next?: string | null; error?: string };
        if (!r.ok) throw new Error(body.error ?? "Copying stopped");
        added += body.added ?? 0;
        skipped += body.skipped ?? 0;
        page = body.next ?? null;
      } while (page);
      if (skipped) setError(`${added} added. ${skipped} skipped (videos, duplicates or pictures that wouldn't copy).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google Photos stopped answering");
    } finally {
      end();
      setBusy("");
      await load();
    }
  }

  async function remove(id: string) {
    await fetch(`/api/household/library/?source=${encodeURIComponent(sourceId)}&photo=${encodeURIComponent(id)}`, { method: "DELETE" });
    setItems((list) => list?.filter((p) => p.id !== id) ?? null);
  }

  if (!saved) return <p className="text-sm text-soft">Save, then add photos to this album.</p>;
  if (!storage) return <p className="text-sm text-bad">Photo storage isn&rsquo;t set up yet.</p>;
  return (
    <div className="grid gap-2">
      <p className="text-sm text-soft">{items === null ? "Loading…" : `${items.length} photos`}</p>
      {items && items.length > 0 && (
        <div className="grid max-h-72 grid-cols-4 gap-1 overflow-y-auto sm:grid-cols-6">
          {items.slice(0, 300).map((p) => (
            <div key={p.id} className="group relative aspect-square overflow-hidden rounded-md bg-line">
              {/* eslint-disable-next-line @next/next/no-img-element -- a private photo through our own proxy */}
              <img
                src={`/api/display/photo/?s=${encodeURIComponent(sourceId)}&i=${encodeURIComponent(p.id)}&w=320`}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                aria-label="Remove this photo"
                className="absolute top-1 right-1 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-sm text-white"
                onClick={() => void remove(p.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <label className={`btn-primary cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
          Upload photos
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={Boolean(busy)}
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {google?.allowed ? (
          <button type="button" className="btn-ghost" disabled={Boolean(busy)} onClick={() => void pickFromGoogle()}>
            Pick from Google Photos
          </button>
        ) : (
          <a className="btn-ghost" href="/api/google/connect/?photos=1">
            Connect Google Photos
          </a>
        )}
      </div>
      {busy && <p className="text-sm text-soft">{busy}</p>}
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  );
}
