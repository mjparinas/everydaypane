"use client";

import { useEffect, useState } from "react";

import { familyAuthError, useFamilyAuth, useFamilyFetch } from "@/components/FamilyAuth";
import { wallAmPm } from "@/display/format";

import { MessageNotesSkeleton } from "./Skeleton";

// The family message board (Melvin, 2026-11-17), for phones: post a note, see what's on the wall, delete your own.
// Admins can also pin a note to the top and delete any. Used by /family/, the admin Messages tab, and `/d/<token>/edit/`.

type Colour = "yellow" | "pink" | "blue" | "green" | "purple";
interface Note {
  id: string;
  author: string;
  text: string;
  colour: Colour;
  pinned: boolean;
  createdAt: number;
  expiresAt: number | null;
  mine: boolean;
  canDelete: boolean;
}

const COLOURS: { value: Colour; label: string; bg: string }[] = [
  { value: "yellow", label: "Yellow", bg: "#fff3a8" },
  { value: "pink", label: "Pink", bg: "#ffd1dc" },
  { value: "blue", label: "Blue", bg: "#cfe6ff" },
  { value: "green", label: "Green", bg: "#d3f5d0" },
  { value: "purple", label: "Purple", bg: "#e5d8ff" },
];
const bgOf = (c: Colour) => COLOURS.find((x) => x.value === c)?.bg ?? "#fff3a8";

const EXPIRY = [
  { value: "", label: "Until Someone Deletes It" },
  { value: "12", label: "12 Hours" },
  { value: "24", label: "1 Day" },
  { value: "72", label: "3 Days" },
  { value: "168", label: "1 Week" },
] as const;

const NAME_KEY = "ep-board-name";

function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

type Board = { messages: Note[]; admin: boolean };

// "5:13 PM" today, "Nov 27" before: short enough for one line beside Pin and Delete, and PM as on the wall.
function when(ms: number): string {
  const d = new Date(ms);
  if (d.toDateString() !== new Date().toDateString()) return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  return wallAmPm(d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }));
}
// When it comes down: the time if that's today, else just the day.
function until(ms: number): string {
  const d = new Date(ms);
  if (d.toDateString() === new Date().toDateString())
    return wallAmPm(d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }));
  return d.toLocaleDateString("en-CA", { weekday: "short" });
}

export function MessageBoard() {
  const familyFetch = useFamilyFetch();
  const { displayToken } = useFamilyAuth();
  const viaDisplay = Boolean(displayToken);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [admin, setAdmin] = useState(false);
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");
  const [colour, setColour] = useState<Colour>("yellow");
  const [expiry, setExpiry] = useState<string>("24");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  // A phone that has posted before just says who it's from (Melvin, 2026-11-28: the form was busy); Change opens the box.
  const [editName, setEditName] = useState(true);

  async function fetchBoard(): Promise<Board | string> {
    try {
      const r = await familyFetch("/api/messages/");
      if (!r.ok) return familyAuthError(r.status, viaDisplay, "Couldn't load the board.");
      return (await r.json()) as Board;
    } catch {
      return "No connection.";
    }
  }

  function show(board: Board | string) {
    if (typeof board === "string") return setError(board);
    setNotes(board.messages);
    setAdmin(board.admin);
    // The name this phone used last time (localStorage only exists in the browser, so it's read once the board loads).
    const remembered = readName();
    setAuthor((a) => a || remembered);
    if (remembered) setEditName(false);
  }
  const load = () => fetchBoard().then(show);

  useEffect(() => {
    let live = true;
    void fetchBoard().then((b) => live && show(b));
    return () => {
      live = false;
    };
    // familyFetch identity changes only when the display token does.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per token
  }, [displayToken]);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      localStorage.setItem(NAME_KEY, author.trim());
    } catch {
      // Private browsing: the name just isn't remembered.
    }
    const r = await familyFetch("/api/messages/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author, text, colour, expiresInHours: expiry ? Number(expiry) : null }),
    });
    setSending(false);
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) return setError(body.error ?? "Couldn't post that.");
    setText("");
    setEditName(false);
    void load();
  }

  async function remove(id: string) {
    setNotes((n) => n?.filter((x) => x.id !== id) ?? null);
    await familyFetch(`/api/messages/${id}/`, { method: "DELETE" });
    void load();
  }

  async function pin(id: string, pinned: boolean) {
    await familyFetch(`/api/messages/${id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned }),
    });
    void load();
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={post} className="card grid gap-3 p-4" aria-label="Post a note">
        <label className="grid">
          <span className="sr-only">Note</span>
          {/* The box takes the note's colour, so the choice below previews itself and needs no label. */}
          <textarea
            className="field min-h-24 border-transparent py-3 text-base text-[#1d1d1f] placeholder:text-[#1d1d1f]/55"
            style={{ background: bgOf(colour) }}
            value={text}
            maxLength={280}
            required
            placeholder="Soccer moved to 5 pm"
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Colour</legend>
          {COLOURS.map((c) => (
            <label key={c.value} className="cursor-pointer">
              <input
                type="radio"
                name="colour"
                className="peer sr-only"
                value={c.value}
                checked={colour === c.value}
                onChange={() => setColour(c.value)}
              />
              <span
                className="block h-11 w-11 rounded-full border-2 border-black/10 peer-checked:border-ink peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40"
                style={{ background: c.bg }}
                title={c.label}
              />
              <span className="sr-only">{c.label}</span>
            </label>
          ))}
        </fieldset>
        <div className="grid grid-cols-2 items-end gap-3">
          {editName ? (
            <label className="grid gap-1 text-sm font-medium">
              From
              <input
                className="field"
                value={author}
                maxLength={30}
                required
                autoComplete="given-name"
                placeholder="Your name"
                onChange={(e) => setAuthor(e.target.value)}
              />
            </label>
          ) : (
            <p className="flex min-h-11 min-w-0 items-center gap-1 text-sm">
              <span className="truncate">
                From <strong>{author}</strong>
              </span>
              <button type="button" className="min-h-11 shrink-0 px-1.5 font-semibold text-brand" onClick={() => setEditName(true)}>
                Change
              </button>
            </p>
          )}
          <label className="grid gap-1 text-sm font-medium">
            Keep It
            <select className="field" value={expiry} onChange={(e) => setExpiry(e.target.value)}>
              {EXPIRY.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="btn-primary" disabled={sending || !text.trim() || !author.trim()}>
          {sending ? "Posting…" : "Post to the Board"}
        </button>
        {error && (
          <p className="text-sm text-bad" role="alert">
            {error}
          </p>
        )}
      </form>

      <section aria-label="On the board" className="grid gap-3">
        {notes === null ? (
          <MessageNotesSkeleton />
        ) : notes.length === 0 ? (
          <p className="text-sm text-soft">The board is empty.</p>
        ) : (
          notes.map((n) => (
            <article
              key={n.id}
              className="grid gap-1 rounded-2xl py-3 pr-2 pl-4 text-[#1d1d1f] shadow-sm"
              style={{ background: bgOf(n.colour) }}
            >
              <p className="pr-2 font-semibold break-words whitespace-pre-wrap">{n.text}</p>
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 text-xs text-[#1d1d1f]/70">
                  {n.pinned ? "Pinned · " : ""}
                  {n.author} · {when(n.createdAt)}
                  {n.expiresAt ? ` · until ${until(n.expiresAt)}` : ""}
                </p>
                <div className="flex shrink-0">
                  {admin && (
                    <button
                      className="min-h-11 rounded-lg px-3 text-sm font-semibold hover:bg-black/10"
                      onClick={() => void pin(n.id, !n.pinned)}
                    >
                      {n.pinned ? "Unpin" : "Pin"}
                    </button>
                  )}
                  {n.canDelete && (
                    <button className="min-h-11 rounded-lg px-3 text-sm font-semibold hover:bg-black/10" onClick={() => void remove(n.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
