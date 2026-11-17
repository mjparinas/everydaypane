import { loadConfig } from "@/server/config";
import { garbageFeed } from "@/server/garbage";
import { json, unauthorized } from "@/server/http";
import { viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  if (!(await viewerFor(req))) return unauthorized();
  try {
    const data = await garbageFeed((await loadConfig()).config);
    return json({ ...data.value, stale: data.stale });
  } catch {
    return json({ error: "The collection calendar is unavailable right now" }, 502);
  }
}
