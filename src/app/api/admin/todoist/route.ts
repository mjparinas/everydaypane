import { json, unauthorized } from "@/server/http";
import { getSecret } from "@/server/secrets";
import { listTodoistProjects, todoistConfigured } from "@/server/todoist";
import { adminFor } from "@/server/viewer";

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const configured = todoistConfigured();
  const connected = Boolean(await getSecret(session.accountId, "todoist.refreshToken"));
  if (!configured || !connected) return json({ configured, connected, lists: [] });
  try {
    return json({ configured, connected: true, lists: await listTodoistProjects(session.accountId) });
  } catch (error) {
    return json({
      configured,
      connected: true,
      lists: [],
      error: error instanceof Error ? error.message : "Todoist didn't answer",
    });
  }
}
