import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { checkSources } from "@/server/photos";
import { adminFor } from "@/server/viewer";

/** Each saved photo source's state for the admin panel: how many photos it lists, and whether they load. */
export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  return json(await checkSources(accountId, (await loadConfig(accountId)).config));
}
