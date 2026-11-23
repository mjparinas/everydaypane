import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";
import { air } from "@/server/weather";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  try {
    const data = await air((await loadConfig(accountId)).config);
    return json({ ...data.value, stale: data.stale });
  } catch {
    return json({ error: "Air quality is unavailable right now" }, 502);
  }
}
