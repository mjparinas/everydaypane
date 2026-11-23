import { loadConfig } from "@/server/config";
import { notFound, unauthorized } from "@/server/http";
import { isMapStyle, mapTile } from "@/server/radar";
import { accountIdOf, viewerFor } from "@/server/viewer";

// One tile of the map under the radar, only for the area around home.
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const url = new URL(req.url);
  const style = url.searchParams.get("s") ?? "";
  const [z, x, y] = ["z", "x", "y"].map((k) => Number(url.searchParams.get(k)));
  if (!isMapStyle(style) || z === undefined || x === undefined || y === undefined) return notFound();
  try {
    return (await mapTile((await loadConfig(accountId)).config, style, z, x, y)) ?? notFound();
  } catch {
    return new Response(null, { status: 502 });
  }
}
