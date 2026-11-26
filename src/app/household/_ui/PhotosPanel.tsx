"use client";

import { useEffect, useState } from "react";

import type { PhotoSource } from "@/lib/config/schema";
import { photoFlag } from "@/lib/featureFlags";

import { ConfirmButton, Section, Select, Text, TextArea, Toggle } from "./fields";
import { useFlags } from "./flags";
import { LibraryAlbum } from "./LibraryAlbum";
import { newId, useAdmin } from "./store";

// Photos (Melvin, 2026-11-17: Amazon Photos, choosable by person). Sources are listed here and picked per photo
// widget. Shared albums need no sign-in; "photos of people" needs Amazon's cookies, which go straight to the server.

interface AmazonStatus {
  connected: boolean;
  people: { id: string; name: string; count: number }[];
  tld?: string;
  error?: string;
}

type SourceCheck = Record<string, { count: number; error: string | null; image: string | null }>;

async function fetchAmazon(): Promise<AmazonStatus> {
  const r = await fetch("/api/household/amazon/");
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as AmazonStatus;
}

const KINDS = [
  { value: "library", label: "Upload, or pick from Google Photos" },
  { value: "amazonShare", label: "Amazon shared album (a link)" },
  { value: "amazonPeople", label: "Amazon photos of people" },
  { value: "urls", label: "A list of photo addresses" },
  { value: "bingPotd", label: "Bing picture of the day" },
  { value: "reddit", label: "Reddit subreddit" },
  { value: "weatherAlbums", label: "Weather-based albums" },
  { value: "immich", label: "Immich" },
  { value: "dropbox", label: "Dropbox folder" },
  { value: "onedrive", label: "OneDrive folder" },
  { value: "box", label: "Box folder" },
  { value: "flickr", label: "Flickr" },
  { value: "smugmug", label: "SmugMug album" },
  { value: "icloudPublished", label: "iCloud published album links" },
] as const;

const SHARE_LINK = /^https:\/\/(www\.)?amazon\.[a-z.]+\/(photos|clouddrive)\/share\/[A-Za-z0-9_-]{10,}/;

export function PhotosPanel() {
  const sources = useAdmin((s) => s.config.integrations.photos.sources);
  const edit = useAdmin((s) => s.edit);
  const [kind, setKind] = useState<PhotoSource["kind"]>("library");
  // Photo sources staff switched off (platform feature flags) can't be added.
  const { on } = useFlags();
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [urls, setUrls] = useState("");
  const [subreddit, setSubreddit] = useState("pics");
  const [immichUrl, setImmichUrl] = useState("");
  const [dropboxPath, setDropboxPath] = useState("");
  const [albumKey, setAlbumKey] = useState("");
  const [amazon, setAmazon] = useState<AmazonStatus | null>(null);
  const [cookie, setCookie] = useState("");
  const [tld, setTld] = useState<"ca" | "com">("ca");
  const [error, setError] = useState("");
  const [checks, setChecks] = useState<SourceCheck | null>(null);

  useEffect(() => {
    let live = true;
    fetchAmazon().then(
      (s) => live && setAmazon(s),
      () => live && setAmazon({ connected: false, people: [] }),
    );
    // How each saved source is doing, so a broken album says why here rather than "Loading photos…" on the wall.
    fetch("/api/household/photos/")
      .then((r) => (r.ok ? (r.json() as Promise<SourceCheck>) : null))
      .then((c) => live && setChecks(c))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  function addSource() {
    setError("");
    const id = newId("photos");
    let source: PhotoSource;
    if (kind === "amazonShare") {
      if (!SHARE_LINK.test(link.trim()))
        return setError("Paste the link from Amazon Photos › Share › Copy link, like https://www.amazon.ca/photos/share/…");
      source = { id, kind, name: name || "Shared album", url: link.trim() };
    } else if (kind === "urls") {
      const list = urls
        .split(/\s+/)
        .map((u) => u.trim())
        .filter((u) => /^https:\/\/\S+$/.test(u));
      if (!list.length) return setError("Add at least one https:// photo address, one per line.");
      source = { id, kind, name: name || "Photos", urls: list.slice(0, 500) };
    } else if (kind === "library") {
      source = { id, kind, name: name || "Family photos" };
    } else if (kind === "bingPotd") {
      source = { id, kind, name: name || "Bing today" };
    } else if (kind === "reddit") {
      const sub = subreddit.replace(/[^A-Za-z0-9_]/g, "");
      if (!sub) return setError("Enter a subreddit name.");
      source = { id, kind, name: name || `r/${sub}`, subreddit: sub, sort: "hot" };
    } else if (kind === "weatherAlbums") {
      source = { id, kind, name: name || "Weather photos", buckets: [], fallbackUrls: [] };
    } else if (kind === "immich") {
      if (!/^https:\/\/\S+/.test(immichUrl.trim())) return setError("Enter your Immich server address (https).");
      source = { id, kind, name: name || "Immich", baseUrl: immichUrl.trim() };
    } else if (kind === "dropbox") {
      source = { id, kind, name: name || "Dropbox", path: dropboxPath.trim() };
    } else if (kind === "onedrive") {
      source = { id, kind, name: name || "OneDrive", folderId: "root" };
    } else if (kind === "box") {
      source = { id, kind, name: name || "Box", folderId: "0" };
    } else if (kind === "flickr") {
      source = { id, kind, name: name || "Flickr", userId: "", photosetId: "" };
    } else if (kind === "smugmug") {
      if (!albumKey.trim()) return setError("Enter the SmugMug album key.");
      source = { id, kind, name: name || "SmugMug", albumKey: albumKey.trim() };
    } else if (kind === "icloudPublished") {
      const list = urls
        .split(/\s+/)
        .map((u) => u.trim())
        .filter((u) => /^https:\/\/\S+$/.test(u));
      if (!list.length) return setError("Paste at least one published iCloud album link.");
      source = { id, kind, name: name || "iCloud", urls: list.slice(0, 500) };
    } else {
      source = { id, kind, name: name || "Family", personIds: [] };
    }
    edit((c) => void c.integrations.photos.sources.push(source));
    setName("");
    setLink("");
    setUrls("");
  }

  async function saveCookie(value: string | null) {
    setError("");
    const r = await fetch("/api/household/amazon/", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cookie: value, tld }),
    });
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) return setError(body.error ?? "Couldn't save the Amazon sign-in.");
    setCookie("");
    setAmazon(await fetchAmazon().catch(() => null));
  }

  const editSource = (id: string, change: (s: PhotoSource) => void) =>
    edit((c) => {
      const s = c.integrations.photos.sources.find((x) => x.id === id);
      if (s) change(s);
    });

  const needsAmazon = sources.some((s) => s.kind === "amazonPeople") || kind === "amazonPeople";

  return (
    <Section title="Photos">
      {sources.length === 0 && <p className="text-sm text-soft">No photo albums yet. Add one below, then pick it on a photo widget.</p>}
      {sources.map((s) => (
        <div key={s.id} className="grid gap-2 rounded-xl border border-line p-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Text label="Name" value={s.name} maxLength={60} onChange={(v) => editSource(s.id, (x) => void (x.name = v))} />
            </div>
            <ConfirmButton
              label="Remove"
              onConfirm={() => {
                // The album stays in the saved document until Save, so Undo can bring it back. Stored photos are
                // deleted then (saveConfig). The screen saver must not keep pointing at an album that's gone.
                edit((c) => {
                  c.integrations.photos.sources = c.integrations.photos.sources.filter((x) => x.id !== s.id);
                  c.screenSaver.photoSourceIds = c.screenSaver.photoSourceIds.filter((x) => x !== s.id);
                  for (const v of c.views)
                    for (const w of v.widgets) if (w.type === "photos") w.sourceIds = w.sourceIds.filter((x) => x !== s.id);
                });
              }}
            />
          </div>
          <p className="truncate text-xs text-soft">
            {s.kind === "amazonShare"
              ? s.url
              : s.kind === "urls"
                ? `${s.urls.length} photo addresses`
                : s.kind === "library"
                  ? "Kept by Everydaypane"
                  : "Amazon photos of the people below"}
          </p>
          {checks?.[s.id] && (
            <p className={`text-sm ${checks[s.id]?.error || checks[s.id]?.image ? "text-bad" : "text-soft"}`}>
              {checks[s.id]?.error ?? checks[s.id]?.image ?? `${checks[s.id]?.count ?? 0} photos`}
            </p>
          )}
          {s.kind === "library" && <LibraryAlbum sourceId={s.id} />}
          {s.kind === "amazonPeople" &&
            (amazon?.connected ? (
              amazon.people.length ? (
                <div className="grid gap-1">
                  {amazon.people.map((p) => (
                    <Toggle
                      key={p.id}
                      label={`${p.name}${p.count ? ` (${p.count})` : ""}`}
                      checked={s.personIds.includes(p.id)}
                      onChange={(on) =>
                        editSource(s.id, (x) => {
                          if (x.kind !== "amazonPeople") return;
                          x.personIds = on ? [...x.personIds, p.id].slice(0, 20) : x.personIds.filter((id) => id !== p.id);
                        })
                      }
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-soft">
                  {amazon.error ?? "Amazon didn't list any people. Name the people in Amazon Photos (People), then reload this page."}
                </p>
              )
            ) : (
              <p className="text-sm text-soft">Sign in to Amazon below to pick people.</p>
            ))}
        </div>
      ))}

      <div className="grid gap-3 border-t border-line pt-4">
        <Select label="Add" value={kind} options={KINDS.filter((k) => on(photoFlag(k.value)))} onChange={(v) => setKind(v)} />
        <Text label="Name" value={name} maxLength={60} placeholder="Family album" onChange={setName} />
        {kind === "amazonShare" && (
          <Text
            label="Share link"
            value={link}
            maxLength={300}
            placeholder="https://www.amazon.ca/photos/share/…"
            hint="In Amazon Photos, open the album, tap Share, then Copy link. Anyone with the link can see it."
            onChange={setLink}
          />
        )}
        {kind === "urls" && <TextArea label="Photo addresses, one per line" value={urls} maxLength={60_000} onChange={setUrls} />}
        {kind === "reddit" && <Text label="Subreddit" value={subreddit} maxLength={60} placeholder="earthporn" onChange={setSubreddit} />}
        {kind === "immich" && (
          <Text
            label="Immich server"
            value={immichUrl}
            maxLength={300}
            placeholder="https://photos.example.com"
            hint="After adding the source, paste its API key here and Save."
            onChange={setImmichUrl}
          />
        )}
        {kind === "dropbox" && (
          <>
            <Text label="Folder path" value={dropboxPath} maxLength={500} placeholder="/Photos" onChange={setDropboxPath} />
            <a className="text-sm text-brand underline-offset-2 hover:underline" href="/api/photos/dropbox/connect/">
              Connect Dropbox
            </a>
          </>
        )}
        {kind === "onedrive" && (
          <a className="text-sm text-brand underline-offset-2 hover:underline" href="/api/microsoft/connect/?files=1">
            Connect Microsoft 365 for OneDrive photos
          </a>
        )}
        {kind === "box" && (
          <a className="text-sm text-brand underline-offset-2 hover:underline" href="/api/photos/box/connect/">
            Connect Box
          </a>
        )}
        {kind === "smugmug" && (
          <>
            <Text label="Album key" value={albumKey} maxLength={80} onChange={setAlbumKey} />
            <a className="text-sm text-brand underline-offset-2 hover:underline" href="/api/photos/smugmug/connect/">
              Connect SmugMug
            </a>
          </>
        )}
        {kind === "icloudPublished" && (
          <>
            <TextArea label="Published album links, one per line" value={urls} maxLength={60_000} onChange={setUrls} />
            <p className="text-xs text-soft">
              See{" "}
              <a className="text-brand underline-offset-2 hover:underline" href="/docs/icloud-photos.md">
                docs/icloud-photos.md
              </a>{" "}
              — no Apple sign-in on the server.
            </p>
          </>
        )}
        {kind === "weatherAlbums" && (
          <p className="text-xs text-soft">After adding, edit buckets in the saved source (library albums or URLs per weather code).</p>
        )}
        {error && <p className="text-sm text-bad">{error}</p>}
        <button type="button" className="btn-primary justify-self-start" onClick={addSource}>
          Add photos
        </button>
      </div>

      {needsAmazon && (
        <div className="grid gap-3 border-t border-line pt-4">
          <h3 className="font-semibold">Amazon sign-in (for photos of people)</h3>
          {amazon?.connected ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-soft">Signed in to amazon.{amazon.tld ?? "ca"}.</p>
              <ConfirmButton label="Sign out" onConfirm={() => void saveCookie(null)} />
            </div>
          ) : (
            <>
              <p className="text-sm text-soft">
                Amazon has no sign-in for apps, so this uses your browser&rsquo;s session. On a computer, sign in at amazon.ca/photos, open
                the developer tools (F12) › Network, reload, click any request to amazon.ca and copy the whole &ldquo;cookie&rdquo; request
                header here. It&rsquo;s stored encrypted and lasts until you sign out of Amazon.
              </p>
              <Select
                label="Amazon site"
                value={tld}
                options={[
                  { value: "ca", label: "amazon.ca" },
                  { value: "com", label: "amazon.com" },
                ]}
                onChange={(v) => setTld(v)}
              />
              <TextArea label="Cookie header" value={cookie} maxLength={8000} onChange={setCookie} />
              <button
                type="button"
                className="btn-primary justify-self-start"
                disabled={!cookie.trim()}
                onClick={() => void saveCookie(cookie)}
              >
                Save Amazon sign-in
              </button>
            </>
          )}
        </div>
      )}
    </Section>
  );
}
