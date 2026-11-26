"use client";

import { useEffect, useRef, useState } from "react";

import { familyAuthError, useFamilyAuth, useFamilyFetch } from "@/components/FamilyAuth";
import { isPicture, prepareUpload } from "@/lib/photoUpload";

// Family photos from phones (Melvin, 2026-11-26: photo frame polish). On /family/ and `/d/<token>/edit/`: pick photos,
// they're shrunk on the phone and added to a library album that the admin opened to the family, and the wall puts each
// one up next. What was just added shows here from the phone's own copy (no thumbnails from the server), each with Undo.
// Renders nothing until an admin switches on "Family can add photos" for an album.

interface Album {
  id: string;
  name: string;
}
interface Added {
  id: string;
  album: string;
  preview: string;
}

export function FamilyPhotos() {
  const familyFetch = useFamilyFetch();
  const { displayToken } = useFamilyAuth();
  const viaDisplay = Boolean(displayToken);
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [album, setAlbum] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [added, setAdded] = useState<Added[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    familyFetch("/api/family/photos/")
      .then((r) => (r.ok ? (r.json() as Promise<{ albums: Album[] }>) : { albums: [] }))
      .then((b) => {
        if (!live) return;
        setAlbums(b.albums);
        setAlbum(b.albums[0]?.id ?? "");
      })
      .catch(() => live && setAlbums([]));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per token
  }, [displayToken]);

  // Previews are the phone's own copies; let them go when the page closes.
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  async function upload(files: FileList | null) {
    if (!files?.length || !album) return;
    setError("");
    const list = [...files].filter(isPicture).slice(0, 30);
    let failed = 0;
    let reason = "";
    for (const [i, file] of list.entries()) {
      setBusy(list.length > 1 ? `Adding ${i + 1} of ${list.length}…` : "Adding…");
      try {
        const { blob, w, h, taken } = await prepareUpload(file);
        const r = await familyFetch(`/api/family/photos/?album=${encodeURIComponent(album)}`, {
          method: "POST",
          headers: {
            "Content-Type": "image/jpeg",
            "x-photo-width": String(w),
            "x-photo-height": String(h),
            ...(taken ? { "x-photo-taken": taken } : {}),
          },
          body: blob,
        });
        const body = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
        if (!r.ok || !body.id) {
          failed++;
          reason = r.status === 401 ? familyAuthError(401, viaDisplay, "") : (body.error ?? "");
          if (r.status === 401 || r.status === 429) break;
          continue;
        }
        const preview = URL.createObjectURL(blob);
        previews.current.push(preview);
        const id = body.id;
        setAdded((a) => [{ id, album, preview }, ...a].slice(0, 12));
      } catch {
        failed++;
      }
    }
    setBusy("");
    if (input.current) input.current.value = "";
    if (failed) setError(`${failed === list.length ? "That didn't go up" : `${failed} of ${list.length} didn't go up`}. ${reason}`.trim());
  }

  async function undo(item: Added) {
    setError("");
    const r = await familyFetch(`/api/family/photos/?album=${encodeURIComponent(item.album)}&photo=${encodeURIComponent(item.id)}`, {
      method: "DELETE",
    }).catch(() => null);
    if (!r?.ok) return setError("Couldn't take that one back. Try again.");
    URL.revokeObjectURL(item.preview);
    setAdded((a) => a.filter((x) => x.id !== item.id));
  }

  if (!albums?.length) return null;
  return (
    <section className="mx-auto grid w-full max-w-xl gap-3" aria-labelledby="photos-heading">
      <h2 id="photos-heading" className="text-lg font-bold">
        Photos for the Wall
      </h2>
      <p className="text-sm text-soft">New photos come up next on the photo frame, within a few minutes.</p>
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
      <label className={`btn-primary justify-self-start ${busy ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
        {busy || "Add Photos"}
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={Boolean(busy)}
          onChange={(e) => void upload(e.target.files)}
        />
      </label>
      {error && (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      )}
      {added.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Just added">
          {added.map((item) => (
            <li key={item.id} className="relative overflow-hidden rounded-xl bg-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: preview, not a page image */}
              <img src={item.preview} alt="" className="aspect-square w-full object-cover" />
              <button
                type="button"
                className="absolute inset-x-1 bottom-1 rounded-lg bg-black/60 py-2 text-xs font-semibold text-white"
                onClick={() => void undo(item)}
              >
                Undo
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
