import { loadConfig } from "@/server/config";
import { displayPayload } from "@/server/display";
import { json, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

// Displays poll this every 30 seconds (AGENTS.md "Admin changes reach displays by polling"). The ETag is the settings
// version (plus the device's view), so an unchanged dashboard costs one small 304.
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const preview = viewer.kind === "person" && viewer.session.role === "admin" ? new URL(req.url).searchParams.get("view") : null;
  if (viewer.kind === "person" && !preview) return unauthorized();
  const { config, version } = await loadConfig(accountId);
  const device = viewer.kind === "device" ? viewer.device : null;
  const etag = `"${version}-${device?.viewId ?? preview ?? "auto"}"`;
  if (req.headers.get("if-none-match") === etag)
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "no-cache" } });
  return json(displayPayload(config, version, device, preview), 200, { ETag: etag, "Cache-Control": "no-cache" });
}
