"use client";

import { useEffect, useState } from "react";

import type { PhotoSource } from "@/lib/config/schema";

import { ConfirmButton, Section, Select, Text, TextArea, Toggle } from "./fields";
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
  const r = await fetch("/api/admin/amazon/");
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as AmazonStatus;
}

const KINDS = [
  { value: "amazonShare", label: "Amazon shared album (a link)" },
  { value: "amazonPeople", label: "Amazon photos of people" },
  { value: "urls", label: "A list of photo addresses" },
] as const;

const SHARE_LINK = /^https:\/\/(www\.)?amazon\.[a-z.]+\/(photos|clouddrive)\/share\/[A-Za-z0-9_-]{10,}/;

export function PhotosPanel() {
  const sources = useAdmin((s) => s.config.integrations.photos.sources);
  const edit = useAdmin((s) => s.edit);
  const [kind, setKind] = useState<PhotoSource["kind"]>("amazonShare");
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [urls, setUrls] = useState("");
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
    fetch("/api/admin/photos/")
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
    const r = await fetch("/api/admin/amazon/", {
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
              onConfirm={() =>
                edit((c) => {
                  c.integrations.photos.sources = c.integrations.photos.sources.filter((x) => x.id !== s.id);
                  for (const v of c.views)
                    for (const w of v.widgets) if (w.type === "photos") w.sourceIds = w.sourceIds.filter((x) => x !== s.id);
                })
              }
            />
          </div>
          <p className="truncate text-xs text-soft">
            {s.kind === "amazonShare"
              ? s.url
              : s.kind === "urls"
                ? `${s.urls.length} photo addresses`
                : "Amazon photos of the people below"}
          </p>
          {checks?.[s.id] && (
            <p className={`text-sm ${checks[s.id]?.error || checks[s.id]?.image ? "text-bad" : "text-soft"}`}>
              {checks[s.id]?.error ?? checks[s.id]?.image ?? `${checks[s.id]?.count ?? 0} photos`}
            </p>
          )}
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
        <Select label="Add" value={kind} options={[...KINDS]} onChange={(v) => setKind(v)} />
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
