import { z } from "zod";

import type { TaskListFeed, TaskProvider } from "@/lib/display/types";
import { tasksFlag } from "@/lib/featureFlags";
import { rateLimit } from "@/server/db";
import { familyEditorAccountId, familyEditorFor, familyEditorIsAdmin, familyEditorKey } from "@/server/familyAuth";
import { featureOn, loadDisplayConfig } from "@/server/featureFlags";
import { GoogleDisconnected } from "@/server/google";
import { TasksNotAllowed } from "@/server/googleTasks";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { MicrosoftDisconnected } from "@/server/microsoft";
import { addTask, tasksFeed, updateTask } from "@/server/tasks";
import { TodoistDisconnected } from "@/server/todoist";

// To-do lists from a phone (Melvin, 2026-11-28: the app should put "editing todo lists" first): the lists switched on
// in Settings › Google Tasks, Microsoft To Do and Todoist, with add, rename, tick off and reopen. Signed-in family and
// the kitchen edit link, like the shopping list; the wall's own `allowCheck` gate is for taps on the wall only.

const PROVIDERS: TaskProvider[] = ["google", "microsoft", "todoist"];
const TITLE_MAX = 200;
const WRITES_PER_HOUR = 240;
const limited = (key: string) => rateLimit(`tasks:${key}`, WRITES_PER_HOUR, 60 * 60_000);
const tooMany = () => json({ error: "That's a lot of changes. Try again later." }, 429);

async function providersOn(): Promise<Set<TaskProvider>> {
  if (!(await featureOn("widget.tasks"))) return new Set();
  const on = await Promise.all(PROVIDERS.map((p) => featureOn(tasksFlag(p))));
  return new Set(PROVIDERS.filter((_, i) => on[i]));
}

const failed = (error: unknown) =>
  error instanceof GoogleDisconnected ||
  error instanceof TasksNotAllowed ||
  error instanceof MicrosoftDisconnected ||
  error instanceof TodoistDisconnected
    ? json({ error: "That to-do service needs connecting again in Household Settings." }, 409)
    : json({ error: "The to-do service didn't answer. Try again." }, 502);

export async function GET(req: Request) {
  const editor = await familyEditorFor(req);
  if (!editor) return unauthorized();
  const accountId = familyEditorAccountId(editor);
  const on = await providersOn();
  const { config } = await loadDisplayConfig(accountId);
  const admin = familyEditorIsAdmin(editor);
  try {
    const feed = (await tasksFeed(accountId, config)).value;
    const lists: TaskListFeed[] = PROVIDERS.filter((p) => on.has(p) && feed[p].connected).flatMap((p) =>
      feed[p].lists.map((l) => ({ ...l, provider: p })),
    );
    return json({ lists, admin });
  } catch (error) {
    if (error instanceof GoogleDisconnected || error instanceof TasksNotAllowed) return json({ lists: [], admin });
    return json({ error: "The to-do lists didn't load. Try again." }, 502);
  }
}

const provider = z.enum(["google", "microsoft", "todoist"]);
const title = z.string().trim().min(1, "Write a to-do").max(TITLE_MAX, `Keep it under ${TITLE_MAX} characters`);
const addBody = z.object({ provider, list: z.string().min(1).max(255), title });
const changeBody = z
  .object({
    provider,
    list: z.string().min(1).max(255),
    task: z.string().min(1).max(255),
    title: title.optional(),
    done: z.boolean().optional(),
  })
  .refine((b) => b.title !== undefined || b.done !== undefined, "Nothing to change");

async function start(req: Request): Promise<{ response: Response } | { accountId: string }> {
  if (!sameOrigin(req)) return { response: json({ error: "Not allowed" }, 403) };
  const editor = await familyEditorFor(req);
  if (!editor) return { response: unauthorized() };
  if (!(await limited(familyEditorKey(editor)))) return { response: tooMany() };
  return { accountId: familyEditorAccountId(editor) };
}

/** Adds a to-do to the end of a list. */
export async function POST(req: Request) {
  const s = await start(req);
  if ("response" in s) return s.response;
  const parsed = addBody.safeParse(await readJson(req, 2_000).catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, 400);
  const { provider: p, list, title: text } = parsed.data;
  if (!(await providersOn()).has(p)) return json({ error: "Not allowed" }, 403);
  const { config } = await loadDisplayConfig(s.accountId);
  try {
    const result = await addTask(s.accountId, config, p, list, text);
    return result === "ok" ? json({ ok: true }, 201) : json({ error: "That list isn't switched on." }, 403);
  } catch (error) {
    return failed(error);
  }
}

/** Renames a to-do, ticks it off (`done: true`) or puts it back (`done: false`). */
export async function PATCH(req: Request) {
  const s = await start(req);
  if ("response" in s) return s.response;
  const parsed = changeBody.safeParse(await readJson(req, 2_000).catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, 400);
  const { provider: p, list, task, title: text, done } = parsed.data;
  if (!(await providersOn()).has(p)) return json({ error: "Not allowed" }, 403);
  const { config } = await loadDisplayConfig(s.accountId);
  try {
    const result = await updateTask(s.accountId, config, p, list, task, { title: text, done });
    return result === "ok" ? json({ ok: true }) : json({ error: "That list isn't switched on." }, 403);
  } catch (error) {
    return failed(error);
  }
}
