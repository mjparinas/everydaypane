"use client";

import { useEffect, useState } from "react";

import { FamilyEventsSkeleton } from "./Skeleton";

// Family calendar events (Melvin, 2026-11-22): post visits and concerts from a phone; they appear on the wall calendar in blue.

interface EventRow {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  createdAt: number;
  mine: boolean;
  canDelete: boolean;
}

type Payload = { events: EventRow[] };

async function loadEvents(): Promise<Payload | string> {
  try {
    const r = await fetch("/api/family-events/");
    if (!r.ok) return r.status === 401 ? "You've been signed out. Sign in again." : "Couldn't load events.";
    return (await r.json()) as Payload;
  } catch {
    return "No connection.";
  }
}

function addDays(date: string, n: number): string {
  // The first paint runs before today's date is filled in, and an empty value must not throw.
  const parsed = Date.parse(`${date}T12:00:00Z`);
  if (!date || Number.isNaN(parsed)) return "";
  return new Date(parsed + n * 86_400_000).toISOString().slice(0, 10);
}

function fmtWhen(e: EventRow): string {
  if (e.allDay) {
    const endIncl = addDays(e.end, -1);
    return endIncl === e.start
      ? new Date(`${e.start}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })
      : `${new Date(`${e.start}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric" })} – ${new Date(`${endIncl}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}`;
  }
  const start = new Date(e.start);
  const end = new Date(e.end);
  const day = start.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
  const t0 = start.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });
  const t1 = end.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });
  return `${day}, ${t0} – ${t1}`;
}

function localYmd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function defaultFormTimes(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  // The phone's own calendar date. toISOString() is UTC, so late evening in B.C. would start the form on tomorrow.
  const today = localYmd(now);
  const startLocal = `${today}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const later = new Date(now.getTime() + 3_600_000);
  return {
    startDate: today,
    startLocal,
    endLocal: `${localYmd(later)}T${pad(later.getHours())}:${pad(later.getMinutes())}`,
  };
}

export function FamilyEvents() {
  const initial = defaultFormTimes();
  const [rows, setRows] = useState<EventRow[] | null>(null);
  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(true);
  const [startDate, setStartDate] = useState(initial.startDate);
  // The last day it covers, as people say it; the server's all-day end is the day after (exclusive).
  const [lastDate, setLastDate] = useState(initial.startDate);
  const [startLocal, setStartLocal] = useState(initial.startLocal);
  const [endLocal, setEndLocal] = useState(initial.endLocal);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  // The form stays folded behind "Add Event" so the list leads (Melvin, 2026-11-28: the family page felt busy).
  const [open, setOpen] = useState(false);

  const refresh = () =>
    loadEvents().then((data) => {
      if (typeof data === "string") return setError(data);
      setRows(data.events);
      setError("");
    });

  useEffect(() => {
    void refresh();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    const start = allDay ? startDate : new Date(startLocal).toISOString();
    const end = allDay ? addDays(lastDate >= startDate ? lastDate : startDate, 1) : new Date(endLocal).toISOString();
    try {
      const r = await fetch("/api/family-events/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), allDay, start, end }),
      });
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setError(body.error ?? "Couldn't save.");
        return;
      }
      setTitle("");
      setOpen(false);
      await refresh();
    } catch {
      setError("No connection.");
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    const r = await fetch(`/api/family-events/${encodeURIComponent(id)}/`, { method: "DELETE" });
    if (!r.ok) {
      setError("Couldn't delete.");
      return;
    }
    await refresh();
  }

  return (
    <section className="grid gap-3" aria-labelledby="events-heading">
      <h2 id="events-heading" className="text-lg font-bold">
        Family Calendar
      </h2>
      <p className="text-sm text-soft">Dentists, games and visits. They show on the wall&apos;s calendars in blue.</p>
      {error && (
        <p className="rounded-xl bg-bad/10 p-3 text-sm text-bad" role="alert">
          {error}
        </p>
      )}
      {!open ? (
        <button type="button" className="btn-ghost justify-self-start" onClick={() => setOpen(true)}>
          Add Event
        </button>
      ) : (
        <form className="card grid gap-3 p-4" onSubmit={(e) => void submit(e)}>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">What</span>
            <input
              className="field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="Dentist for Sam"
              autoFocus
              required
            />
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
            <input type="checkbox" className="h-5 w-5 accent-brand" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            All Day
          </label>
          {allDay ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="grid min-w-0 gap-1">
                <span className="text-sm font-semibold">First Day</span>
                <input
                  className="field min-w-0 px-2"
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (lastDate < e.target.value) setLastDate(e.target.value);
                  }}
                  required
                />
              </label>
              <label className="grid min-w-0 gap-1">
                <span className="text-sm font-semibold">Last Day</span>
                <input
                  className="field min-w-0 px-2"
                  type="date"
                  value={lastDate}
                  min={startDate}
                  onChange={(e) => setLastDate(e.target.value)}
                  required
                />
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="grid min-w-0 gap-1">
                <span className="text-sm font-semibold">Starts</span>
                <input
                  className="field min-w-0 px-2"
                  type="datetime-local"
                  value={startLocal}
                  onChange={(e) => setStartLocal(e.target.value)}
                  required
                />
              </label>
              <label className="grid min-w-0 gap-1">
                <span className="text-sm font-semibold">Ends</span>
                <input
                  className="field min-w-0 px-2"
                  type="datetime-local"
                  value={endLocal}
                  onChange={(e) => setEndLocal(e.target.value)}
                  required
                />
              </label>
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn-primary flex-1" type="submit" disabled={sending}>
              {sending ? "Saving…" : "Add to Calendar"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <ul className="grid gap-2">
        {rows === null ? (
          <FamilyEventsSkeleton />
        ) : rows.length === 0 ? (
          <li className="text-sm text-soft">Nothing coming up.</li>
        ) : (
          rows.map((ev) => (
            <li key={ev.id} className="card flex items-center justify-between gap-3 p-3">
              {/* The Family calendar's own blue, as on the wall. */}
              <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ background: "#5b8def" }} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{ev.title}</div>
                <div className="text-sm text-soft">{fmtWhen(ev)}</div>
              </div>
              {ev.canDelete && (
                <button type="button" className="btn-ghost shrink-0 text-sm" onClick={() => void remove(ev.id)}>
                  Delete
                </button>
              )}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
