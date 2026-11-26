import { loadDisplayConfig } from "@/server/featureFlags";
import { json, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";
import { weather } from "@/server/weather";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  try {
    const data = await weather((await loadDisplayConfig(accountId)).config);
    return json({ ...data.value, stale: data.stale });
  } catch {
    return json({ error: "Weather is unavailable right now" }, 502);
  }
}
