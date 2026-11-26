import { z } from "zod";

import { loadDisplayConfig } from "@/server/featureFlags";
import { GoogleDisconnected } from "@/server/google";
import { TasksNotAllowed } from "@/server/googleTasks";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { completeTask, tasksFeed } from "@/server/tasks";
import { accountIdOf, viewerFor } from "@/server/viewer";

/** The open tasks of the lists switched on in Settings, shared by every tasks widget. Displays poll it every minute. */
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const { config } = await loadDisplayConfig(accountId);
  try {
    const data = await tasksFeed(accountId, config);
    return json({ ...data.value, stale: data.stale });
  } catch (error) {
    if (error instanceof GoogleDisconnected || error instanceof TasksNotAllowed)
      return json({
        updatedAt: Date.now(),
        google: { connected: false, lists: [] },
        microsoft: { connected: false, lists: [] },
        todoist: { connected: false, lists: [] },
      });
    return json({ error: "Google Tasks is unavailable right now" }, 502);
  }
}

const body = z.object({
  provider: z.enum(["google", "microsoft", "todoist"]).default("google"),
  list: z.string().min(1).max(255),
  task: z.string().min(1).max(255),
});

/** A tap on the wall: marks one task done, in a list a widget that allows ticking shows. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const parsed = body.safeParse(await readJson(req, 2000).catch(() => null));
  if (!parsed.success) return json({ error: "Bad request" }, 400);
  try {
    const { config } = await loadDisplayConfig(accountId);
    const result = await completeTask(accountId, config, parsed.data.provider, parsed.data.list, parsed.data.task);
    return result === "ok" ? json({ ok: true }) : json({ error: "Not allowed" }, 403);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Google Tasks didn't answer" }, 502);
  }
}
