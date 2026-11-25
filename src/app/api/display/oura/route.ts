import { localDate } from "@/lib/calendar";
import type { OuraData } from "@/lib/display/types";
import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { OuraDisconnected, ouraFeed, OuraMembershipNeeded } from "@/server/oura";
import { accountIdOf, viewerFor } from "@/server/viewer";

// Oura scores for the wall, polled every 15 minutes. Last night's details (bedtime, HRV, heart rate) leave the server
// only when some Oura widget in the household's views has `showDetails` on, so a scores-only wall never receives them.
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const config = (await loadConfig(accountId)).config;
  const today = localDate(Date.now(), config.location.timeZone);
  const details = config.views.some((v) => v.widgets.some((w) => w.type === "oura" && w.showDetails));
  let body: OuraData;
  try {
    body = await ouraFeed(accountId, today);
  } catch (error) {
    if (error instanceof OuraDisconnected) body = { updatedAt: Date.now(), connected: false, today };
    else
      body = {
        updatedAt: Date.now(),
        connected: true,
        today,
        error: error instanceof OuraMembershipNeeded ? error.message : "Oura isn't answering right now",
      };
  }
  if (!details) delete body.night;
  return json(body);
}
