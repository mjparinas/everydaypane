import "server-only";

import { z } from "zod";

import type { DashboardConfig } from "@/lib/config/schema";
import type { TaskItem } from "@/lib/display/types";

import { cached, forget, type Cached } from "./cache";
import { accessToken, tasksGranted } from "./google";

// Google Tasks (Melvin, 2026-11-17: he asked for Google Keep, which has no API for personal accounts, and chose Tasks
// instead). The same Google connection as the calendar, with the `tasks` scope added when the admin connects Tasks.
// The server reads the lists switched on in Settings into one small feed (a minute's cache, so ticking a task off on a
// phone reaches the wall within about two minutes), and a tap on the wall marks a task done through our own route,
// only for a list that a widget allowing it shows.

const API = "https://tasks.googleapis.com/tasks/v1";
const TTL = 60_000;

export class TasksNotAllowed extends Error {
  constructor() {
    super("Connect Google Tasks first");
  }
}

async function call(accountId: string, path: string, init: RequestInit = {}): Promise<unknown> {
  if (!(await tasksGranted(accountId))) throw new TasksNotAllowed();
  const token = await accessToken(accountId);
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "Everydaypane/1.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 401 || r.status === 403) {
    const body = await r.text().catch(() => "");
    console.error(`[google-tasks] ${r.status} for ${path.split("?")[0]}: ${body.slice(0, 300)}`);
    if (/SERVICE_DISABLED|has not been used|is disabled/i.test(body)) throw new Error("Turn on the Google Tasks API in Google Cloud");
    throw new TasksNotAllowed();
  }
  if (!r.ok) throw new Error(`Google Tasks answered ${r.status}`);
  return r.json() as Promise<unknown>;
}

// ---- Lists ----

const listsSchema = z.object({ items: z.array(z.object({ id: z.string(), title: z.string().optional() })).default([]) });

export interface GoogleTaskList {
  id: string;
  name: string;
}

export function trimLists(raw: unknown): GoogleTaskList[] {
  return listsSchema.parse(raw).items.map((l) => ({ id: l.id, name: (l.title || "Untitled list").slice(0, 120) }));
}

export async function listTaskLists(accountId: string): Promise<GoogleTaskList[]> {
  return trimLists(await call(accountId, "/users/@me/lists?maxResults=100"));
}

// ---- Tasks ----

const taskSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  status: z.string().optional(),
  due: z.string().optional(),
  parent: z.string().optional(),
  position: z.string().optional(),
  deleted: z.boolean().optional(),
  hidden: z.boolean().optional(),
});
const tasksSchema = z.object({ items: z.array(z.unknown()).default([]), nextPageToken: z.string().optional() });

/**
 * A list's open tasks in Google's own order: top-level tasks by position, each followed by its subtasks. Done, deleted
 * and untitled tasks are left out, and so are subtasks whose parent isn't shown.
 */
export function trimTasks(raw: unknown[]): TaskItem[] {
  const open = raw
    .map((r) => taskSchema.safeParse(r))
    .flatMap((r) => (r.success ? [r.data] : []))
    .filter((t) => t.status !== "completed" && !t.deleted && !t.hidden && (t.title ?? "").trim() !== "");
  const byPosition = (a: { position?: string }, b: { position?: string }) => (a.position ?? "").localeCompare(b.position ?? "");
  const item = (t: (typeof open)[number], sub: boolean): TaskItem => ({
    id: t.id,
    title: (t.title ?? "").trim().slice(0, 200),
    ...(t.due ? { due: t.due.slice(0, 10) } : {}),
    ...(sub ? { sub: true } : {}),
  });
  const out: TaskItem[] = [];
  for (const top of open.filter((t) => !t.parent).sort(byPosition)) {
    out.push(item(top, false));
    for (const child of open.filter((t) => t.parent === top.id).sort(byPosition)) out.push(item(child, true));
  }
  return out;
}

async function tasksOf(accountId: string, listId: string): Promise<TaskItem[]> {
  const raw: unknown[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 3; page++) {
    const q = new URLSearchParams({ showCompleted: "false", showHidden: "false", maxResults: "100" });
    if (pageToken) q.set("pageToken", pageToken);
    const body = tasksSchema.parse(await call(accountId, `/lists/${encodeURIComponent(listId)}/tasks?${q}`));
    raw.push(...body.items);
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return trimTasks(raw).slice(0, 100);
}

export type GoogleTasksFeed = { connected: boolean; lists: { id: string; name: string; tasks: TaskItem[] }[] };

/** Every open Google Task of the lists switched on in Settings. */
export async function googleTasksFeed(accountId: string, config: DashboardConfig, now = Date.now()): Promise<Cached<GoogleTasksFeed>> {
  if (!(await tasksGranted(accountId))) throw new TasksNotAllowed();
  await accessToken(accountId, now);
  const lists = config.integrations.tasks.lists.filter((l) => l.enabled);
  return cached(
    `google-tasks:${accountId}:${lists.map((l) => l.id).join(",")}`,
    TTL,
    async () => {
      const tasks = await Promise.all(lists.map((l) => tasksOf(accountId, l.id)));
      return { connected: true, lists: lists.map((l, i) => ({ id: l.id, name: l.name, tasks: tasks[i] ?? [] })) };
    },
    now,
  );
}

/** Whether a display may tick off tasks in this list: it's switched on, and a tasks widget that allows it shows it. */
export function mayComplete(config: DashboardConfig, listId: string): boolean {
  const enabled = config.integrations.tasks.lists.some((l) => l.enabled && l.id === listId);
  if (!enabled) return false;
  return config.views.some((v) =>
    v.widgets.some(
      (w) => w.type === "tasks" && w.provider === "google" && w.allowCheck && (w.listIds.length === 0 || w.listIds.includes(listId)),
    ),
  );
}

/** Marks a task done in Google Tasks. A task Google no longer has is refused, and the cached list is dropped. */
export async function completeTask(
  accountId: string,
  config: DashboardConfig,
  listId: string,
  taskId: string,
): Promise<"ok" | "forbidden"> {
  if (!mayComplete(config, listId)) return "forbidden";
  const path = `/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`;
  try {
    await call(accountId, path);
  } catch (error) {
    if (error instanceof Error && error.message.endsWith("answered 404")) {
      await forget("google-tasks:");
      return "forbidden";
    }
    throw error;
  }
  await call(accountId, path, {
    method: "PATCH",
    body: JSON.stringify({ status: "completed" }),
  });
  await forget("google-tasks:");
  await forget("tasks-unified:");
  return "ok";
}
