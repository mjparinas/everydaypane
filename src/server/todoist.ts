import "server-only";

import { z } from "zod";

import type { DashboardConfig } from "@/lib/config/schema";
import type { TaskItem } from "@/lib/display/types";

import { cached, forget } from "./cache";
import { randomToken } from "./crypto";
import { env } from "./env";
import type { TaskChange } from "./googleTasks";
import { getSecret, setSecret } from "./secrets";

const API = "https://api.todoist.com/rest/v2";
const TTL = 60_000;

export const todoistConfigured = () => Boolean(env.todoistClientId() && env.todoistClientSecret());

export class TodoistDisconnected extends Error {
  constructor() {
    super("Todoist needs to be connected again");
  }
}

const access = new Map<string, { token: string; expiresAt: number; refresh: string }>();

export async function connectTodoist(accountId: string, code: string, redirect: string, now = Date.now()): Promise<void> {
  const r = await fetch("https://todoist.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.todoistClientId(),
      client_secret: env.todoistClientSecret(),
      code,
      redirect_uri: redirect,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error("Todoist refused the code");
  const body = (await r.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("Todoist didn't send a token");
  await setSecret(accountId, "todoist.refreshToken", body.access_token, now);
  access.set(accountId, { token: body.access_token, expiresAt: Number.POSITIVE_INFINITY, refresh: body.access_token });
  await forget("tasks:");
}

async function token(accountId: string): Promise<string> {
  const refresh = await getSecret(accountId, "todoist.refreshToken");
  if (!refresh) throw new TodoistDisconnected();
  return refresh;
}

async function call(accountId: string, path: string, init: RequestInit = {}): Promise<unknown> {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await token(accountId)}`, "Content-Type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 401) throw new TodoistDisconnected();
  if (!r.ok) throw new Error(`Todoist answered ${r.status}`);
  // Closing and reopening answer 204 with no body.
  if (r.status === 204) return null;
  return r.json() as Promise<unknown>;
}

const projectSchema = z.object({ id: z.string(), name: z.string().optional() });
const taskSchema = z.object({
  id: z.string(),
  content: z.string(),
  due: z.object({ date: z.string().optional() }).optional(),
  parent_id: z.string().nullable().optional(),
  is_completed: z.boolean().optional(),
});

export function trimProjects(raw: unknown): { id: string; name: string }[] {
  const rows = z.array(projectSchema).parse(raw);
  return rows.map((p) => ({ id: p.id, name: (p.name ?? "Project").slice(0, 120) }));
}

export async function listTodoistProjects(accountId: string): Promise<{ id: string; name: string }[]> {
  return trimProjects(await call(accountId, "/projects"));
}

export function trimTodoistTasks(raw: unknown[]): TaskItem[] {
  return raw
    .map((r) => taskSchema.safeParse(r))
    .flatMap((r) => (r.success ? [r.data] : []))
    .filter((t) => !t.is_completed && t.content.trim())
    .map((t) => ({
      id: t.id,
      title: t.content.trim().slice(0, 200),
      ...(t.due?.date ? { due: t.due.date.slice(0, 10) } : {}),
      ...(t.parent_id ? { sub: true as const } : {}),
    }));
}

async function tasksOf(accountId: string, projectId: string): Promise<TaskItem[]> {
  const raw = z.array(z.unknown()).parse(await call(accountId, `/tasks?project_id=${encodeURIComponent(projectId)}`));
  return trimTodoistTasks(raw).slice(0, 100);
}

export async function todoistTasksFeed(
  accountId: string,
  config: DashboardConfig,
  now = Date.now(),
): Promise<{ connected: boolean; lists: { id: string; name: string; tasks: TaskItem[] }[] }> {
  const refresh = await getSecret(accountId, "todoist.refreshToken");
  if (!refresh) return { connected: false, lists: [] };
  const lists = config.integrations.todoist.lists.filter((l) => l.enabled);
  const result = await cached(
    `todoist-tasks:${accountId}:${lists.map((l) => l.id).join(",")}`,
    TTL,
    async () => {
      const tasks = await Promise.all(lists.map((l) => tasksOf(accountId, l.id)));
      return { connected: true, lists: lists.map((l, i) => ({ id: l.id, name: l.name, tasks: tasks[i] ?? [] })) };
    },
    now,
  );
  return result.value;
}

export function mayCompleteTodoist(config: DashboardConfig, listId: string): boolean {
  const enabled = config.integrations.todoist.lists.some((l) => l.enabled && l.id === listId);
  if (!enabled) return false;
  return config.views.some((v) =>
    v.widgets.some(
      (w) => w.type === "tasks" && w.provider === "todoist" && w.allowCheck && (w.listIds.length === 0 || w.listIds.includes(listId)),
    ),
  );
}

export async function completeTodoistTask(
  accountId: string,
  config: DashboardConfig,
  listId: string,
  taskId: string,
): Promise<"ok" | "forbidden"> {
  if (!mayCompleteTodoist(config, listId)) return "forbidden";
  await call(accountId, `/tasks/${encodeURIComponent(taskId)}/close`, { method: "POST" });
  await forget("todoist-tasks:");
  await forget("tasks:");
  return "ok";
}

export const todoistRedirectUri = (origin: string) => `${env.siteUrl() || origin}/api/todoist/callback/`;

export const newTodoistState = () => randomToken(24);

export function todoistConsentUrl(state: string, redirect: string): string {
  const p = new URLSearchParams({ client_id: env.todoistClientId(), scope: "data:read_write", state, redirect_uri: redirect });
  return `https://todoist.com/oauth/authorize?${p}`;
}

export const todoistListOn = (config: DashboardConfig, listId: string) =>
  config.integrations.todoist.lists.some((l) => l.enabled && l.id === listId);

export async function addTodoistTask(accountId: string, projectId: string, title: string): Promise<void> {
  await call(accountId, "/tasks", { method: "POST", body: JSON.stringify({ content: title, project_id: projectId }) });
  await forget("todoist-tasks:");
}

export async function updateTodoistTask(accountId: string, taskId: string, change: TaskChange): Promise<void> {
  const path = `/tasks/${encodeURIComponent(taskId)}`;
  if (change.title !== undefined) await call(accountId, path, { method: "POST", body: JSON.stringify({ content: change.title }) });
  if (change.done !== undefined) await call(accountId, `${path}/${change.done ? "close" : "reopen"}`, { method: "POST" });
  await forget("todoist-tasks:");
}
