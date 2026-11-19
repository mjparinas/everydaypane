import { commuteFeed } from "@/server/commute";
import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { viewerFor } from "@/server/viewer";

export async function GET(req: Request) {
  if (!(await viewerFor(req))) return unauthorized();
  try {
    return json(await commuteFeed((await loadConfig()).config));
  } catch {
    return json({ error: "Commute times are unavailable right now" }, 502);
  }
}
