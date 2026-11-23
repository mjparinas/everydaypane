import { loadConfig } from "@/server/config";
import { ferriesFeed } from "@/server/ferries";
import { json, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  return json(await ferriesFeed((await loadConfig(accountId)).config));
}
