import { loadConfig } from "@/server/config";
import { env } from "@/server/env";
import { json, unauthorized } from "@/server/http";
import { findStops, staticPack } from "@/server/translink";
import { adminFor } from "@/server/viewer";

// The first read of TransLink's static timetable (stop names) can take a few seconds.
export const maxDuration = 60;

/** The transit widget's stop search: by stop number or name, or the stops nearest the dashboard with nothing typed. */
export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 60);
  const keySet = Boolean(env.translinkKey());
  try {
    const pack = await staticPack();
    return json({ keySet, stops: findStops(pack, q, (await loadConfig(accountId)).config.location) });
  } catch {
    return json({ keySet, stops: [], error: "TransLink's stop list didn't download. Try again in a minute." }, 502);
  }
}
