import "server-only";

import type { DashboardConfig } from "@/lib/config/schema";
import type { TaskProvider, TasksData } from "@/lib/display/types";

import { cached, type Cached } from "./cache";
import { completeTask as completeGoogleTask, googleTasksFeed, mayComplete as mayCompleteGoogle, TasksNotAllowed } from "./googleTasks";
import { completeMicrosoftTask, mayCompleteMicrosoft, microsoftTasksFeed } from "./microsoftToDo";
import { completeTodoistTask, mayCompleteTodoist, TodoistDisconnected, todoistTasksFeed } from "./todoist";

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
