"use client";

import { useEffect, useState, type FormEvent } from "react";

import { familyAuthError, useFamilyAuth, useFamilyFetch } from "@/components/FamilyAuth";
import type { TaskItem, TaskListFeed } from "@/lib/display/types";

import { Bone, ButtonBone, SkeletonRegion } from "./Skeleton";

// To-do lists from a phone (Melvin, 2026-11-28: the app should put "editing todo lists" near the top). The lists
// switched on in Settings › Google Tasks, Microsoft To Do and Todoist, one at a time behind a row of chips: add a
// to-do, tick it off (Undo puts it back), or tap its name to rename it. Changes go straight to the service, and the
// wall's To-dos widget shows them within a minute.

const PROVIDER_NAMES = { google: "Google Tasks", microsoft: "Microsoft To Do", todoist: "Todoist" } as const;
const PICKED_KEY = "everydaypane.tasks.list";

type Feed = { lists: TaskListFeed[]; admin: boolean };
const keyOf = (l: TaskListFeed) => `${l.provider}:${l.id}`;

function rememberedList(): string {
  try {
    return localStorage.getItem(PICKED_KEY) ?? "";
  } catch {
    return "";
  }
}

export function FamilyTasks() {
  const familyFetch = useFamilyFetch();
  const { displayToken } = useFamilyAuth();
  const viaDisplay = Boolean(displayToken);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [picked, setPicked] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Ticked off since this list was opened: shown struck through with Undo until the list is switched or reloaded.
  const [ticked, setTicked] = useState<TaskItem[]>([]);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);

  async function fetchFeed(): Promise<Feed | string> {
    try {
      const r = await familyFetch("/api/family/tasks/");
      if (!r.ok) return familyAuthError(r.status, viaDisplay, "Couldn't load the to-do lists.");
      return (await r.json()) as Feed;
    } catch {
      return "No connection.";
    }
  }

  function show(next: Feed | string) {
    if (typeof next === "string") return setError(next);
    setFeed(next);
    setError("");
  }

  useEffect(() => {
    let live = true;
    void fetchFeed().then((next) => {
      if (!live) return;
      show(next);
      setPicked(rememberedList());
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per token
  }, [displayToken]);

  const lists = feed?.lists ?? [];
  const list = lists.find((l) => keyOf(l) === picked) ?? lists[0];

  function pick(l: TaskListFeed) {
    setPicked(keyOf(l));
    setTicked([]);
    setEditing(null);
    setError("");
    try {
      localStorage.setItem(PICKED_KEY, keyOf(l));
    } catch {
      // Private mode: the first list opens next time.
    }
  }

  async function send(method: "POST" | "PATCH", body: Record<string, unknown>, fallback: string): Promise<boolean> {
    if (!list) return false;
    setBusy(true);
    try {
      const r = await familyFetch("/api/family/tasks/", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: list.provider, list: list.id, ...body }),
      });
      if (!r.ok) {
        const answer = (await r.json().catch(() => null)) as { error?: unknown } | null;
        setError(
          r.status === 401 ? familyAuthError(401, viaDisplay, fallback) : typeof answer?.error === "string" ? answer.error : fallback,
        );
        return false;
      }
      setError("");
      show(await fetchFeed());
      return true;
    } catch {
      setError("No connection. That change wasn't saved.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const title = text.trim();
    if (!title) return;
    if (await send("POST", { title }, "Couldn't add that.")) setText("");
  }

  async function tick(task: TaskItem) {
    if (await send("PATCH", { task: task.id, done: true }, "Couldn't tick that off."))
      setTicked((t) => [task, ...t.filter((x) => x.id !== task.id)]);
  }

  async function undo(task: TaskItem) {
    if (await send("PATCH", { task: task.id, done: false }, "Couldn't put that back.")) setTicked((t) => t.filter((x) => x.id !== task.id));
  }

  async function rename() {
    if (!editing) return;
    const title = editing.title.trim();
    const before = list?.tasks.find((t) => t.id === editing.id)?.title;
    setEditing(null);
    if (!title || title === before) return;
    await send("PATCH", { task: editing.id, title }, "Couldn't rename that.");
  }

  if (!feed)
    return error ? (
      <p className="text-sm text-bad">{error}</p>
    ) : (
      <SkeletonRegion label="Loading the to-do lists…" className="grid gap-3">
        <div className="flex gap-2">
          <ButtonBone className="w-24" />
          <ButtonBone className="w-20" />
        </div>
        <div className="flex gap-2">
          <Bone className="h-11 min-w-0 flex-1 rounded-xl" />
          <ButtonBone className="w-16" />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex min-h-11 items-center gap-3 py-2">
            <Bone className="h-5 w-5 shrink-0 rounded-md" />
            <Bone className={`h-4 ${["w-40", "w-28", "w-36", "w-24"][i]}`} />
          </div>
        ))}
      </SkeletonRegion>
    );

  if (!list)
    return (
      <div className="card grid gap-2">
        <p className="font-semibold">No to-do lists yet</p>
        <p className="text-sm text-soft">
          {feed.admin
            ? "Connect Google Tasks, Microsoft To Do or Todoist and switch lists on, and they show up here to edit."
            : "Ask whoever runs the household to connect Google Tasks, Microsoft To Do or Todoist in Household Settings."}
        </p>
        {feed.admin && (
          <a className="btn-ghost justify-self-start" href="/household/#settings/tasks">
            Connect To-Do Lists
          </a>
        )}
      </div>
    );

  const tickedIds = new Set(ticked.map((t) => t.id));
  const open = list.tasks.filter((t) => !tickedIds.has(t.id));
  const providers = new Set(lists.map((l) => l.provider));

  return (
    <div className="grid gap-3">
      {lists.length > 1 && (
        <div role="group" aria-label="Lists" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {lists.map((l) => (
            <button
              key={keyOf(l)}
              type="button"
              aria-pressed={l === list}
              onClick={() => pick(l)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap transition ${
                l === list ? "border-brand bg-brand text-white" : "border-line bg-panel text-ink"
              }`}
            >
              {l.name}
              {providers.size > 1 && <span className="sr-only"> ({PROVIDER_NAMES[l.provider]})</span>}
            </button>
          ))}
        </div>
      )}
      <form className="flex gap-2" onSubmit={(e) => void add(e)}>
        <label className="min-w-0 flex-1">
          <span className="sr-only">New to-do in {list.name}</span>
          <input
            className="field"
            value={text}
            maxLength={200}
            placeholder="Book the dentist"
            enterKeyHint="done"
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <button className="btn-primary" disabled={busy || !text.trim()}>
          Add
        </button>
      </form>
      {error && (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      )}
      {open.length === 0 && ticked.length === 0 ? (
        <p className="text-sm text-soft">Nothing to do on {list.name}.</p>
      ) : (
        <ul className="grid gap-1" aria-label={list.name}>
          {open.map((task) => (
            <li key={task.id} className={`flex min-h-11 items-center gap-3 ${task.sub ? "pl-8" : ""}`}>
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-brand"
                checked={false}
                disabled={busy}
                aria-label={`Tick off ${task.title}`}
                onChange={() => void tick(task)}
              />
              {editing?.id === task.id ? (
                <input
                  className="field min-w-0 flex-1 py-1"
                  value={editing.title}
                  maxLength={200}
                  aria-label={`Rename ${task.title}`}
                  enterKeyHint="done"
                  autoFocus
                  onChange={(e) => setEditing({ id: task.id, title: e.target.value })}
                  onBlur={() => void rename()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="min-w-0 flex-1 py-2 text-left break-words"
                  aria-label={`Rename ${task.title}`}
                  disabled={busy}
                  onClick={() => setEditing({ id: task.id, title: task.title })}
                >
                  {task.title}
                  {task.due && <span className="ml-2 text-xs text-soft">{dueLabel(task.due)}</span>}
                </button>
              )}
            </li>
          ))}
          {ticked.map((task) => (
            <li key={task.id} className="flex min-h-11 items-center gap-3">
              <input type="checkbox" className="h-5 w-5 shrink-0 accent-brand" checked readOnly tabIndex={-1} aria-hidden />
              <span className="min-w-0 flex-1 break-words text-soft line-through">{task.title}</span>
              <button type="button" className="btn-ghost px-3" disabled={busy} onClick={() => void undo(task)}>
                Undo
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-soft">Saved to {PROVIDER_NAMES[list.provider]}. Tap a to-do to rename it.</p>
    </div>
  );
}

/** "Due Today", "Due Tomorrow" or "Due Dec 4", from the date the service keeps. */
export function dueLabel(due: string, today = new Date()): string {
  const [y, m, d] = due.split("-").map(Number);
  if (!y || !m || !d) return "";
  const at = new Date(y, m - 1, d);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((at.getTime() - start.getTime()) / 86_400_000);
  if (days < 0) return "Overdue";
  if (days === 0) return "Due Today";
  if (days === 1) return "Due Tomorrow";
  return `Due ${at.toLocaleDateString("en-CA", { month: "short", day: "numeric" })}`;
}
