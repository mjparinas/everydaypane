import { loadConfig } from "@/server/config";
import { albumArt } from "@/server/homeassistant";
import { notFound, unauthorized } from "@/server/http";
import { viewerFor } from "@/server/viewer";

/** The album art of what a music widget's player is playing. Only players the dashboard shows. */
export async function GET(req: Request) {
  if (!(await viewerFor(req))) return unauthorized();
  const entity = new URL(req.url).searchParams.get("e") ?? "";
  try {
    return (await albumArt((await loadConfig()).config, entity)) ?? notFound();
  } catch {
    return new Response(null, { status: 502 });
  }
}
