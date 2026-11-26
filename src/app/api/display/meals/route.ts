import { localDate } from "@/lib/calendar";
import { loadDisplayConfig } from "@/server/featureFlags";
import { json, unauthorized } from "@/server/http";
import { mealsBetween, planTag } from "@/server/meals";
import { accountIdOf, viewerFor } from "@/server/viewer";

// The meal plan for the meals widget: today and the week after it (eight days, so the evening view can start from
// tomorrow). Displays poll it; an unchanged plan answers 304.
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const today = localDate(Date.now(), (await loadDisplayConfig(accountId)).config.location.timeZone);
  const body = { today, meals: await mealsBetween(accountId, today, 8) };
  const tag = planTag(body);
  if (req.headers.get("if-none-match") === tag)
    return new Response(null, { status: 304, headers: { etag: tag, "Cache-Control": "no-store" } });
  return json(body, 200, { etag: tag });
}
