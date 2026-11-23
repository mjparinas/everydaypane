import { loadConfig } from "@/server/config";
import { displayPayload } from "@/server/display";
import { json, unauthorized } from "@/server/http";
import { planForAccount } from "@/server/planGates";
import { accountIdOf, viewerFor } from "@/server/viewer";

// Displays poll this every 30 seconds (and Household walls also long-poll config-watch). The ETag is the settings
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
  const instantRefresh = (await planForAccount(accountId)) === "paid";
  return json(displayPayload(config, version, device, preview, { instantRefresh }), 200, {
    ETag: etag,
    "Cache-Control": "no-cache",
  });
}
