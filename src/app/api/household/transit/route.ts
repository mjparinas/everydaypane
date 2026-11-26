import { TRANSIT_AGENCY_IDS, type TransitAgencyId } from "@/lib/transitAgencies";
import { loadConfig } from "@/server/config";
import { env } from "@/server/env";
import { json, unauthorized } from "@/server/http";
import { findStops, staticPack } from "@/server/translink";
import { adminFor } from "@/server/viewer";

// The first read of an agency's static timetable (stop names) can take a few seconds; TTC's is about 29 MB.
export const maxDuration = 60;

/** The transit widget's stop search: by stop number or name, or the stops nearest the dashboard with nothing typed. */
export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").slice(0, 60);
  const asked = params.get("agency") ?? "translink";
  if (!(TRANSIT_AGENCY_IDS as readonly string[]).includes(asked)) return json({ error: "Unknown agency" }, 400);
  const agency = asked as TransitAgencyId;
  // Only TransLink needs a key; the other agencies' feeds are open.
  const keySet = agency !== "translink" || Boolean(env.translinkKey());
  try {
    const pack = await staticPack(Date.now(), agency);
    return json({ keySet, stops: findStops(pack, q, (await loadConfig(accountId)).config.location) });
  } catch {
    return json({ keySet, stops: [], error: "The agency's stop list didn't download. Try again in a minute." }, 502);
  }
}
