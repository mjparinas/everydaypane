import { json, unauthorized } from "@/server/http";
import { microsoftConfigured } from "@/server/microsoft";
import { todoGranted } from "@/server/microsoftPhotos";
import { listMicrosoftTodoLists } from "@/server/microsoftToDo";
import { getSecret } from "@/server/secrets";
import { adminFor } from "@/server/viewer";

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const configured = microsoftConfigured();
  const connected = Boolean(await getSecret(session.accountId, "microsoft.refreshToken"));
  const allowed = connected && (await todoGranted(session.accountId));
  if (!configured || !allowed) return json({ configured, connected, allowed, lists: [] });
  try {
    return json({ configured, connected: true, allowed: true, lists: await listMicrosoftTodoLists(session.accountId) });
  } catch (error) {
    return json({
      configured,
      connected: true,
      allowed: true,
      lists: [],
      error: error instanceof Error ? error.message : "Microsoft To Do didn't answer",
    });
  }
}
