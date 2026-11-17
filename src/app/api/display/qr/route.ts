import { loadConfig } from "@/server/config";
import { notFound, unauthorized } from "@/server/http";
import { viewerFor } from "@/server/viewer";
import { qrSvg, wifiString } from "@/server/wifi";

export async function GET(req: Request) {
  if (!(await viewerFor(req))) return unauthorized();
  const id = new URL(req.url).searchParams.get("w");
  const { config } = await loadConfig();
  const widget = config.views.flatMap((v) => v.widgets).find((w) => w.id === id);
  if (widget?.type !== "wifiQr") return notFound();
  return new Response(qrSvg(wifiString(widget)), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=300" } });
}
