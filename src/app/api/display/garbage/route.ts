import { loadDisplayConfig } from "@/server/featureFlags";
import { garbageFeed } from "@/server/garbage";
import { json, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  try {
    const data = await garbageFeed((await loadDisplayConfig(accountId)).config);
    return json({ ...data.value, stale: data.stale });
  } catch {
    return json({ error: "The collection calendar is unavailable right now" }, 502);
  }
}
