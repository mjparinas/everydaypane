"use client";

import { useEffect, useState } from "react";

import { Section, Toggle } from "./fields";
import { useAdmin } from "./store";

// Google Tasks (Melvin, 2026-11-17): allow Tasks on the Google connection once, then pick which of the account's
// lists tasks widgets may show. Each widget can narrow that further in its own settings.

interface Status {
  configured: boolean;
  allowed: boolean;
  lists: { id: string; name: string }[];
  expired?: boolean;
  error?: string;
}

async function fetchStatus(): Promise<Status> {
  const r = await fetch("/api/household/google-tasks/");
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as Status;
}

export function TasksPanel() {
  const lists = useAdmin((s) => s.config.integrations.tasks.lists);
  const edit = useAdmin((s) => s.edit);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    fetchStatus().then(
      (s) => live && setStatus(s),
      () => live && setError("Couldn't check Google Tasks."),
    );
    return () => {
      live = false;
    };
  }, []);

  function setList(id: string, enabled: boolean) {
    const known = status?.lists.find((l) => l.id === id);
    edit((c) => {
      const saved = c.integrations.tasks.lists;
      const existing = saved.find((x) => x.id === id);
      if (existing) {
        existing.enabled = enabled;
        if (known) existing.name = known.name;
      } else if (known && saved.length < 50) saved.push({ id, name: known.name, enabled });
    });
  }

  // Lists from the account, plus any saved ones the account no longer has (so they can be switched off).
  const rows = status
    ? [
        ...status.lists.map((g) => ({ id: g.id, name: g.name, enabled: lists.find((l) => l.id === g.id)?.enabled ?? false, gone: false })),
        ...lists.filter((l) => !status.lists.some((g) => g.id === l.id)).map((l) => ({ ...l, gone: true })),
      ]
    : [];

  return (
    <Section title="Google Tasks">
      {error && <p className="text-sm text-bad">{error}</p>}
      {!status ? (
        !error && <p className="text-sm text-soft">Checking…</p>
      ) : !status.configured ? (
        <p className="text-sm text-soft">
          Google sign-in isn&rsquo;t set up on the server yet (connect Google Calendar under Settings › Calendars first).
        </p>
      ) : !status.allowed ? (
        <>
          <p className="text-sm text-soft">
            {status.expired
              ? "Google stopped accepting the connection. Connect it again."
              : "Show to-do lists from Google Tasks on the wall, and tick tasks off with a tap. Google asks once to allow it."}
          </p>
          <a className="btn-primary justify-self-start" href="/api/google/connect/?tasks=1">
            Connect Google Tasks
          </a>
        </>
      ) : (
        <>
          {status.error && <p className="text-sm text-bad">{status.error}</p>}
          <p className="text-xs text-soft">Pick the lists that tasks widgets may show, then Save.</p>
          <div className="grid gap-2">
            {rows.map((r) => (
              <Toggle
                key={r.id}
                label={r.gone ? `${r.name} (no longer in the account)` : r.name}
                checked={r.enabled}
                onChange={(v) => setList(r.id, v)}
              />
            ))}
            {!rows.length && !status.error && <p className="text-sm text-soft">This account has no task lists.</p>}
          </div>
        </>
      )}
    </Section>
  );
}

function TodoistPanel() {
  const lists = useAdmin((s) => s.config.integrations.todoist.lists);
  const edit = useAdmin((s) => s.edit);
  const [status, setStatus] = useState<{ configured: boolean; connected: boolean; lists: { id: string; name: string }[] } | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/household/todoist/")
      .then((r) => (r.ok ? (r.json() as Promise<typeof status>) : null))
      .then((s) => live && s && setStatus(s))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const setList = (id: string, enabled: boolean, name: string) => {
    edit((c) => {
      const saved = c.integrations.todoist.lists;
      const row = saved.find((x) => x.id === id);
      if (row) row.enabled = enabled;
      else if (saved.length < 50) saved.push({ id, name, enabled });
    });
  };

  return (
    <Section title="Todoist">
      {!status ? (
        <p className="text-sm text-soft">Checking…</p>
      ) : !status.configured ? (
        <p className="text-sm text-soft">Set TODOIST_CLIENT_ID and TODOIST_CLIENT_SECRET on the server.</p>
      ) : !status.connected ? (
        <a className="btn-primary justify-self-start" href="/api/todoist/connect/">
          Connect Todoist
        </a>
      ) : (
        <div className="grid gap-2">
          {status.lists.map((l) => (
            <Toggle
              key={l.id}
              label={l.name}
              checked={lists.find((x) => x.id === l.id)?.enabled ?? false}
              onChange={(v) => setList(l.id, v, l.name)}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

function MicrosoftTodoPanel() {
  const lists = useAdmin((s) => s.config.integrations.microsoft.todoLists);
  const edit = useAdmin((s) => s.edit);
  const [status, setStatus] = useState<{ configured: boolean; allowed: boolean; lists: { id: string; name: string }[] } | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/household/microsoft-todo/")
      .then((r) => (r.ok ? (r.json() as Promise<typeof status>) : null))
      .then((s) => live && s && setStatus(s))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  return (
    <Section title="Microsoft To Do">
      {!status ? (
        <p className="text-sm text-soft">Checking…</p>
      ) : !status.allowed ? (
        <>
          <p className="text-sm text-soft">Uses the same Microsoft app as calendars, with Tasks permission.</p>
          <a className="btn-primary justify-self-start" href="/api/microsoft/connect/?todo=1">
            Allow Microsoft To Do
          </a>
        </>
      ) : (
        <div className="grid gap-2">
          {status.lists.map((l) => (
            <Toggle
              key={l.id}
              label={l.name}
              checked={lists.find((x) => x.id === l.id)?.enabled ?? false}
              onChange={(v) =>
                edit((c) => {
                  const saved = c.integrations.microsoft.todoLists;
                  const row = saved.find((x) => x.id === l.id);
                  if (row) row.enabled = v;
                  else if (saved.length < 50) saved.push({ id: l.id, name: l.name, enabled: v });
                })
              }
            />
          ))}
        </div>
      )}
    </Section>
  );
}

export function AllTasksPanels() {
  return (
    <>
      <TasksPanel />
      <MicrosoftTodoPanel />
      <TodoistPanel />
    </>
  );
}
