import { fitbitFeed } from "@/server/fitbit";
import { json, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const today = new Date().toISOString().slice(0, 10);
  try {
    return json(await fitbitFeed(accountId, today));
  } catch {
    return json({ updatedAt: Date.now(), connected: false, steps: 0, sleepMinutes: 0 });
  }
}
