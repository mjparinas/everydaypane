import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { viewerFor } from "@/server/viewer";
import { air } from "@/server/weather";

export async function GET(req: Request) {
  if (!(await viewerFor(req))) return unauthorized();
  try {
    const data = await air((await loadConfig()).config);
    return json({ ...data.value, stale: data.stale });
  } catch {
    return json({ error: "Air quality is unavailable right now" }, 502);
  }
}
