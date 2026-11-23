import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { schoolStatus } from "@/server/school";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  return json(await schoolStatus((await loadConfig(accountId)).config));
}
