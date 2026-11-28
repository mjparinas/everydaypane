import "server-only";

import { z } from "zod";

import type { DashboardConfig } from "@/lib/config/schema";
import type { TaskItem } from "@/lib/display/types";

import { cached, forget } from "./cache";
import type { TaskChange } from "./googleTasks";
import { accessToken, MicrosoftDisconnected } from "./microsoft";
import { graphGet, todoGranted } from "./microsoftPhotos";

const TTL = 60_000;

const listSchema = z.object({
  value: z.array(z.object({ id: z.string(), displayName: z.string().optional() })).default([]),
});

const taskSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  status: z.string().optional(),
  dueDateTime: z.object({ dateTime: z.string().optional() }).optional(),
});

export function trimTodoLists(raw: unknown): { id: string; name: string }[] {
  return listSchema.parse(raw).value.map((l) => ({ id: l.id, name: (l.displayName ?? "Tasks").slice(0, 120) }));
}

export async function listMicrosoftTodoLists(accountId: string): Promise<{ id: string; name: string }[]> {
  return trimTodoLists(await graphGet(accountId, "/me/todo/lists"));
}

export function trimMicrosoftTasks(raw: unknown[]): TaskItem[] {
  return raw
    .map((r) => taskSchema.safeParse(r))
    .flatMap((r) => (r.success ? [r.data] : []))
    .filter((t) => t.status !== "completed" && (t.title ?? "").trim())
    .map((t) => ({
      id: t.id,
      title: (t.title ?? "").trim().slice(0, 200),
      ...(t.dueDateTime?.dateTime ? { due: t.dueDateTime.dateTime.slice(0, 10) } : {}),
    }));
}

async function tasksOf(accountId: string, listId: string): Promise<TaskItem[]> {
  const body = (await graphGet(accountId, `/me/todo/lists/${encodeURIComponent(listId)}/tasks?$top=100`)) as { value?: unknown[] };
  return trimMicrosoftTasks(body.value ?? []).slice(0, 100);
}

export async function microsoftTasksFeed(
  accountId: string,
  config: DashboardConfig,
  now = Date.now(),
): Promise<{ connected: boolean; lists: { id: string; name: string; tasks: TaskItem[] }[] }> {
  if (!(await todoGranted(accountId))) return { connected: false, lists: [] };
  const lists = config.integrations.microsoft.todoLists.filter((l) => l.enabled);
  try {
    const result = await cached(
      `m365-tasks:${accountId}:${lists.map((l) => l.id).join(",")}`,
      TTL,
      async () => {
        const tasks = await Promise.all(lists.map((l) => tasksOf(accountId, l.id)));
        return { connected: true, lists: lists.map((l, i) => ({ id: l.id, name: l.name, tasks: tasks[i] ?? [] })) };
      },
      now,
    );
    return result.value;
  } catch (error) {
    if (error instanceof MicrosoftDisconnected) return { connected: false, lists: [] };
    throw error;
  }
}

export function mayCompleteMicrosoft(config: DashboardConfig, listId: string): boolean {
  const enabled = config.integrations.microsoft.todoLists.some((l) => l.enabled && l.id === listId);
  if (!enabled) return false;
  return config.views.some((v) =>
    v.widgets.some(
      (w) => w.type === "tasks" && w.provider === "microsoft" && w.allowCheck && (w.listIds.length === 0 || w.listIds.includes(listId)),
    ),
  );
}

export async function completeMicrosoftTask(
  accountId: string,
  config: DashboardConfig,
  listId: string,
  taskId: string,
): Promise<"ok" | "forbidden"> {
  if (!mayCompleteMicrosoft(config, listId)) return "forbidden";
  const token = await accessToken(accountId);
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/me/todo/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!r.ok) throw new Error(`Microsoft To Do answered ${r.status}`);
  await forget("m365-tasks:");
  await forget("tasks:");
  return "ok";
}

export const microsoftListOn = (config: DashboardConfig, listId: string) =>
  config.integrations.microsoft.todoLists.some((l) => l.enabled && l.id === listId);

async function graphWrite(accountId: string, method: "POST" | "PATCH", path: string, body: unknown): Promise<void> {
  const token = await accessToken(accountId);
  const r = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Microsoft To Do answered ${r.status}`);
  await forget("m365-tasks:");
}

export function addMicrosoftTask(accountId: string, listId: string, title: string): Promise<void> {
  return graphWrite(accountId, "POST", `/me/todo/lists/${encodeURIComponent(listId)}/tasks`, { title });
}

export function updateMicrosoftTask(accountId: string, listId: string, taskId: string, change: TaskChange): Promise<void> {
  const body: Record<string, unknown> = {};
  if (change.title !== undefined) body.title = change.title;
  if (change.done !== undefined) body.status = change.done ? "completed" : "notStarted";
  return graphWrite(accountId, "PATCH", `/me/todo/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`, body);
}
