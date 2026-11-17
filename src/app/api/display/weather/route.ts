import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { viewerFor } from "@/server/viewer";
import { weather } from "@/server/weather";

export async function GET(req: Request) {
  if (!(await viewerFor(req))) return unauthorized();
  try {
    const data = await weather((await loadConfig()).config);
    return json({ ...data.value, stale: data.stale });
  } catch {
    return json({ error: "Weather is unavailable right now" }, 502);
  }
}
