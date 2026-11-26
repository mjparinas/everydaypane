import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { laundryFeed } from "@/server/laundry";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const { config } = await loadConfig(accountId);
  return json(await laundryFeed(accountId, config));
}
