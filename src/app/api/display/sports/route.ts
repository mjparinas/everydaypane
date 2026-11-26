import { loadDisplayConfig } from "@/server/featureFlags";
import { json, unauthorized } from "@/server/http";
import { sportsFeed } from "@/server/sports";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  try {
    return json(await sportsFeed((await loadDisplayConfig(accountId)).config));
  } catch {
    return json({ error: "Scores are unavailable right now" }, 502);
  }
}
