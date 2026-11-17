import { loadConfig } from "@/server/config";
import { notFound, unauthorized } from "@/server/http";
import { photoImage } from "@/server/photos";
import { viewerFor } from "@/server/viewer";

// One photo, at about the width the display draws it. The request names a source and a photo id that the server listed
// itself; it never carries a URL, so this can't be used to fetch anything else.
export async function GET(req: Request) {
  if (!(await viewerFor(req))) return unauthorized();
  const url = new URL(req.url);
  const source = url.searchParams.get("s") ?? "";
  const id = url.searchParams.get("i") ?? "";
  const width = Number(url.searchParams.get("w")) || 1920;
  if (!source || !id || id.length > 200) return notFound();
  try {
    return (await photoImage((await loadConfig()).config, source, id, width)) ?? notFound();
  } catch {
    return new Response(null, { status: 502 });
  }
}
