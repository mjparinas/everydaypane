import { commuteFeed } from "@/server/commute";
import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  try {
    return json(await commuteFeed((await loadConfig(accountId)).config));
  } catch {
    return json({ error: "Commute times are unavailable right now" }, 502);
  }
}
