import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";
import { ynabFeed } from "@/server/ynab";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  try {
    return json(await ynabFeed(accountId, (await loadConfig(accountId)).config));
  } catch {
    return json({ updatedAt: Date.now(), connected: false, budgetName: "", accounts: [], categories: [] });
  }
}
