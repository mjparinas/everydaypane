import "server-only";

import type { DashboardConfig } from "@/lib/config/schema";
import type { TaskProvider, TasksData } from "@/lib/display/types";

import { cached, forget, type Cached } from "./cache";
import {
  addGoogleTask,
  completeTask as completeGoogleTask,
  googleListOn,
  googleTasksFeed,
  mayComplete as mayCompleteGoogle,
  TasksNotAllowed,
  updateGoogleTask,
  type TaskChange,
} from "./googleTasks";
import {
  addMicrosoftTask,
  completeMicrosoftTask,
  mayCompleteMicrosoft,
  microsoftListOn,
  microsoftTasksFeed,
  updateMicrosoftTask,
} from "./microsoftToDo";
import {
  addTodoistTask,
  completeTodoistTask,
  mayCompleteTodoist,
  TodoistDisconnected,
  todoistListOn,
  todoistTasksFeed,
  updateTodoistTask,
} from "./todoist";

const TTL = 55_000;

/** Unified tasks feed for Google Tasks, Microsoft To Do and Todoist. */
export async function tasksFeed(accountId: string, config: DashboardConfig, now = Date.now()): Promise<Cached<TasksData>> {
  const key = `tasks-unified:${accountId}`;
  return cached(
    key,
    TTL,
    async () => {
      let google: TasksData["google"] = { connected: false, lists: [] };
      let microsoft: TasksData["microsoft"] = { connected: false, lists: [] };
      let todoist: TasksData["todoist"] = { connected: false, lists: [] };
      try {
        const g = await googleTasksFeed(accountId, config, now);
        google = g.value;
      } catch (error) {
        if (!(error instanceof TasksNotAllowed)) throw error;
      }
      microsoft = await microsoftTasksFeed(accountId, config, now);
      try {
        todoist = await todoistTasksFeed(accountId, config, now);
      } catch (error) {
        if (!(error instanceof TodoistDisconnected)) throw error;
      }
      return { updatedAt: now, google, microsoft, todoist };
    },
    now,
  );
}

export async function completeTask(
  accountId: string,
  config: DashboardConfig,
  provider: TaskProvider,
  listId: string,
  taskId: string,
): Promise<"ok" | "forbidden"> {
  switch (provider) {
    case "google":
      return completeGoogleTask(accountId, config, listId, taskId);
    case "microsoft":
      return completeMicrosoftTask(accountId, config, listId, taskId);
    case "todoist":
      return completeTodoistTask(accountId, config, listId, taskId);
    default:
      return "forbidden";
  }
}

export function mayCompleteTasks(config: DashboardConfig, provider: TaskProvider, listId: string): boolean {
  switch (provider) {
    case "google":
      return mayCompleteGoogle(config, listId);
    case "microsoft":
      return mayCompleteMicrosoft(config, listId);
    case "todoist":
      return mayCompleteTodoist(config, listId);
    default:
      return false;
  }
}

// ---- Edits from phones (Melvin, 2026-11-28: "editing todo lists" from the app) ----
// A signed-in phone may add, rename, tick off and reopen tasks in any list switched on in Settings, whatever the wall's
// widgets allow, as with the shopping list. Nothing else (due dates, deleting, moving) is written to the services.

/** Whether a phone may edit this list: it is switched on in Settings. */
export function listOn(config: DashboardConfig, provider: TaskProvider, listId: string): boolean {
  switch (provider) {
    case "google":
      return googleListOn(config, listId);
    case "microsoft":
      return microsoftListOn(config, listId);
    case "todoist":
      return todoistListOn(config, listId);
    default:
      return false;
  }
}

export async function addTask(accountId: string, config: DashboardConfig, provider: TaskProvider, listId: string, title: string) {
  if (!listOn(config, provider, listId)) return "forbidden" as const;
  if (provider === "google") await addGoogleTask(accountId, listId, title);
  else if (provider === "microsoft") await addMicrosoftTask(accountId, listId, title);
  else await addTodoistTask(accountId, listId, title);
  await forget("tasks-unified:");
  return "ok" as const;
}

export async function updateTask(
  accountId: string,
  config: DashboardConfig,
  provider: TaskProvider,
  listId: string,
  taskId: string,
  change: TaskChange,
) {
  if (!listOn(config, provider, listId)) return "forbidden" as const;
  if (provider === "google") await updateGoogleTask(accountId, listId, taskId, change);
  else if (provider === "microsoft") await updateMicrosoftTask(accountId, listId, taskId, change);
  else await updateTodoistTask(accountId, taskId, change);
  await forget("tasks-unified:");
  return "ok" as const;
}
