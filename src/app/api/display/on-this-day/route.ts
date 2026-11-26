import { localDate } from "@/lib/calendar";
import { loadDisplayConfig } from "@/server/featureFlags";
import { json, unauthorized } from "@/server/http";
import { onThisDayFeed } from "@/server/onThisDay";
import { accountIdOf, viewerFor } from "@/server/viewer";

// Wikipedia's "On this day" for today in the dashboard's time zone. ?kind=events|births, ?safe=0 turns the
// family-friendly filter off.
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const { config } = await loadDisplayConfig(accountIdOf(viewer));
  const params = new URL(req.url).searchParams;
  const kind = params.get("kind") === "births" ? "births" : "events";
  const safe = params.get("safe") !== "0";
  return json(await onThisDayFeed(localDate(Date.now(), config.location.timeZone), kind, safe));
}
