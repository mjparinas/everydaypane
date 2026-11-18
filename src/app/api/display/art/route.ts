import { loadConfig } from "@/server/config";
import { albumArt } from "@/server/homeassistant";
import { notFound, unauthorized } from "@/server/http";
import { musicArt } from "@/server/music";
import { viewerFor } from "@/server/viewer";

/**
 * The album art of what a music widget's player is playing. Only players the dashboard shows: a Home Assistant
 * media player (?e=), or a direct Spotify or Sonos player (?p=, with the hash the feed gave as ?k=).
 */
export async function GET(req: Request) {
  if (!(await viewerFor(req))) return unauthorized();
  const params = new URL(req.url).searchParams;
  const player = params.get("p");
  try {
    const { config } = await loadConfig();
    if (player) return (await musicArt(config, player, params.get("k") ?? "")) ?? notFound();
    return (await albumArt(config, params.get("e") ?? "")) ?? notFound();
  } catch {
    return new Response(null, { status: 502 });
  }
}
