import { editPageUrl } from "@/lib/editPage";
import { loadConfig } from "@/server/config";
import { deviceToken } from "@/server/devices";
import { env } from "@/server/env";
import { notFound, unauthorized } from "@/server/http";
import { viewerFor } from "@/server/viewer";
import { qrSvg, wifiString } from "@/server/wifi";

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const id = new URL(req.url).searchParams.get("w");
  const { config } = await loadConfig();
  const widget = config.views.flatMap((v) => v.widgets).find((w) => w.id === id);
  if (!widget) return notFound();

  if (widget.type === "wifiQr") {
    return new Response(qrSvg(wifiString(widget)), {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=300" },
    });
  }

  if (widget.type === "editQr") {
    // The wall's cookie only holds a hash; look up the sealed token so the QR encodes the real edit address.
    // Admin preview has no device — show a sample path so the tile still looks like a QR.
    const origin = env.siteUrl() || new URL(req.url).origin;
    let text = `${origin.replace(/\/$/, "")}/d/XXXXXXXX/edit/`;
    if (viewer.kind === "device") {
      const token = await deviceToken(viewer.device.id);
      if (token) text = editPageUrl(origin, token);
    }
    return new Response(qrSvg(text), {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=60" },
    });
  }

  return notFound();
}
