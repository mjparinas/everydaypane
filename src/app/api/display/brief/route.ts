import { BRIEF_SOURCES } from "@/lib/brief";
import { briefFeed } from "@/server/brief";
import { loadDisplayConfig } from "@/server/featureFlags";
import { json, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

// The morning brief for one brief widget (?w=<widget id>): its sources and options come from the saved settings, never
// from the request, so a display can't make the server read anything the household didn't switch on.
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const { config } = await loadDisplayConfig(accountId);
  const id = new URL(req.url).searchParams.get("w");
  const widgets = config.views.flatMap((v) => v.widgets).filter((w) => w.type === "brief");
  const w = widgets.find((x) => x.id === id) ?? widgets[0] ?? { sources: [...BRIEF_SOURCES], events: 3, eveningTomorrow: true };
  return json(await briefFeed(accountId, config, w));
}
