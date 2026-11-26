import { loadDisplayConfig } from "@/server/featureFlags";
import { notFound, unauthorized } from "@/server/http";
import { isPrecip, radarFrame } from "@/server/radar";
import { accountIdOf, viewerFor } from "@/server/viewer";

// One radar picture of the area around home. The request names a kind, a zoom and a time the server listed; it never
// carries an address.
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const url = new URL(req.url);
  const precip = url.searchParams.get("p") ?? "";
  const zoom = Number(url.searchParams.get("z"));
  const time = Number(url.searchParams.get("time"));
  if (!isPrecip(precip) || !Number.isFinite(time)) return notFound();
  try {
    return (await radarFrame((await loadDisplayConfig(accountId)).config, precip, zoom, time)) ?? notFound();
  } catch {
    return new Response(null, { status: 502 });
  }
}
