import { loadDisplayConfig } from "@/server/featureFlags";
import { albumArt } from "@/server/homeassistant";
import { notFound, unauthorized } from "@/server/http";
import { musicArt } from "@/server/music";
import { accountIdOf, viewerFor } from "@/server/viewer";

/**
 * The album art of what a music widget's player is playing. Only players the dashboard shows: a Home Assistant
 * media player (?e=), or a direct Spotify or Sonos player (?p=, with the hash the feed gave as ?k=).
 */
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const params = new URL(req.url).searchParams;
  const player = params.get("p");
  try {
    const { config } = await loadDisplayConfig(accountId);
    if (player) return (await musicArt(accountId, config, player, params.get("k") ?? "")) ?? notFound();
    return (await albumArt(accountId, config, params.get("e") ?? "")) ?? notFound();
  } catch {
    return new Response(null, { status: 502 });
  }
}
