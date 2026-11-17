import { googleConfigured, GoogleDisconnected, tasksGranted } from "@/server/google";
import { listTaskLists, TasksNotAllowed } from "@/server/googleTasks";
import { json, unauthorized } from "@/server/http";
import { adminFor } from "@/server/viewer";

/** Whether Google Tasks is allowed, and the account's task lists for the admin panel's picker. */
export async function GET(req: Request) {
  if (!(await adminFor(req))) return unauthorized();
  const configured = googleConfigured();
  if (!configured || !(await tasksGranted())) return json({ configured, allowed: false, lists: [] });
  try {
    return json({ configured, allowed: true, lists: await listTaskLists() });
  } catch (error) {
    if (error instanceof GoogleDisconnected || error instanceof TasksNotAllowed)
      return json({ configured, allowed: false, lists: [], expired: true });
    return json({
      configured,
      allowed: true,
      lists: [],
      error:
        error instanceof Error && error.message.includes("Tasks API")
          ? error.message
          : "Google Tasks didn't answer. Try again in a minute.",
    });
  }
}
