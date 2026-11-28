"use client";

import { useEffect, useState } from "react";

import { localDate } from "@/lib/calendar";
import { nativePlugin, sharedTextItems, type SharedItem } from "@/lib/nativeApp";

// What someone shared into the app from another one (Melvin, 2026-11-27). The app's share extension (iOS) or share
// intent (Android) keeps the items until this page reads them; photos arrive already shrunk to at most 2048 px.

interface Album {
  id: string;
  name: string;
}

async function dataUrlBlob(data: string): Promise<Blob> {
  return (await fetch(data)).blob();
}

export function ShareInbox() {
  const [items, setItems] = useState<SharedItem[] | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [album, setAlbum] = useState("");
  const [day, setDay] = useState(() => localDate(Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone));
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const native = nativePlugin();
    if (!native) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- outside the app there is nothing to read
      setItems([]);
      return;
    }
    void native
      .getSharedItems()
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
    void fetch("/api/family/photos/")
      .then((r) => (r.ok ? (r.json() as Promise<{ albums: Album[] }>) : { albums: [] }))
      .then((b) => {
        setAlbums(b.albums);
        setAlbum(b.albums[0]?.id ?? "");
      })
      .catch(() => undefined);
  }, []);

  const images = items?.filter((i) => i.kind === "image" && i.data) ?? [];
  const text = (items ?? [])
    .filter((i) => i.kind !== "image")
    .map((i) => i.text ?? "")
    .join("\n")
    .trim();
  const lines = sharedTextItems(text);

  async function finish(message: string) {
    await nativePlugin()
      ?.clearSharedItems()
      .catch(() => undefined);
    await nativePlugin()
      ?.refreshWidgets()
      .catch(() => undefined);
    setItems([]);
    setDone(message);
  }

  async function sendPhotos() {
    setBusy("photos");
    setError("");
    let sent = 0;
    for (const img of images) {
      const r = await fetch(`/api/family/photos/?album=${encodeURIComponent(album)}`, {
        method: "POST",
        headers: { "Content-Type": "image/jpeg", "x-photo-width": String(img.width ?? 0), "x-photo-height": String(img.height ?? 0) },
        body: await dataUrlBlob(img.data ?? ""),
      }).catch(() => null);
      if (r?.ok) sent++;
      else if (r?.status === 429) break;
    }
    setBusy("");
    if (sent === images.length) await finish(sent === 1 ? "Added to the photo frame." : `Added ${sent} photos to the photo frame.`);
    else setError(`${images.length - sent} of ${images.length} didn't go up. Try again.`);
  }

  async function addShopping() {
    setBusy("shopping");
    setError("");
    let added = 0;
    for (const line of lines) {
      const r = await fetch("/api/shopping/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: line }),
      }).catch(() => null);
      if (r?.ok) added++;
    }
    setBusy("");
    if (added) await finish(added === 1 ? "Added to the shopping list." : `Added ${added} items to the shopping list.`);
    else setError("Couldn't add that to the shopping list.");
  }

  async function planDinner() {
    setBusy("meal");
    setError("");
    const meal = (lines[0] ?? text).slice(0, 120);
    const r = await fetch("/api/meals/", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: day, slot: "dinner", text: meal }),
    }).catch(() => null);
    setBusy("");
    if (r?.ok) await finish("Planned for dinner.");
    else setError("Couldn't plan that meal.");
  }

  if (items === null) return <p className="text-sm text-soft">Opening what you shared…</p>;
  if (done || !items.length)
    return (
      <div className="grid gap-3">
        <p className="text-sm">{done || "Nothing shared right now. Use Share › Everydaypane in Photos, your browser or Notes."}</p>
        <a className="btn-primary justify-self-start" href="/family/">
          Back to Family
        </a>
      </div>
    );

  return (
    <div className="grid gap-4">
      {images.length > 0 && (
        <section className="grid gap-3 rounded-2xl border border-line bg-panel p-4" aria-labelledby="share-photos">
          <h2 id="share-photos" className="text-lg font-bold">
            {images.length === 1 ? "1 Photo" : `${images.length} Photos`}
          </h2>
          <div className="flex flex-wrap gap-2">
            {images.slice(0, 12).map((img, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- a local data URL, not something to optimise
              <img key={i} src={img.data} alt="" className="h-20 w-20 rounded-lg object-cover" />
            ))}
          </div>
          {albums.length ? (
            <>
              {albums.length > 1 && (
                <label className="grid gap-1 text-sm">
                  <span className="font-semibold">Album</span>
                  <select className="field" value={album} onChange={(e) => setAlbum(e.target.value)}>
                    {albums.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name || "Photos"}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button type="button" className="btn-primary justify-self-start" disabled={Boolean(busy)} onClick={() => void sendPhotos()}>
                {busy === "photos" ? "Adding…" : "Add to the Photo Frame"}
              </button>
            </>
          ) : (
            <p className="text-sm text-soft">
              No album takes photos from phones yet. An admin can switch on “Family Can Add Photos” in Settings › Photos.
            </p>
          )}
        </section>
      )}
      {text && (
        <section className="grid gap-3 rounded-2xl border border-line bg-panel p-4" aria-labelledby="share-text">
          <h2 id="share-text" className="text-lg font-bold">
            Text
          </h2>
          <p className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-sm">{text}</p>
          <button
            type="button"
            className="btn-primary justify-self-start"
            disabled={Boolean(busy) || !lines.length}
            onClick={() => void addShopping()}
          >
            {busy === "shopping" ? "Adding…" : lines.length > 1 ? `Add ${lines.length} Items to Shopping` : "Add to Shopping"}
          </button>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Dinner On</span>
              <input type="date" className="field" value={day} onChange={(e) => setDay(e.target.value)} />
            </label>
            <button type="button" className="btn-ghost" disabled={Boolean(busy)} onClick={() => void planDinner()}>
              {busy === "meal" ? "Planning…" : "Plan for Dinner"}
            </button>
          </div>
        </section>
      )}
      {error && (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn-ghost justify-self-start" onClick={() => void finish("")}>
        Discard
      </button>
    </div>
  );
}
