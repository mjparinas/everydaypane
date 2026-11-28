import { displayPayload } from "@/server/display";
import { DISPLAY_ASSET_VERSION } from "@/server/displayHtml";
import { loadDisplayConfig } from "@/server/featureFlags";
import { json, unauthorized } from "@/server/http";
import { planForAccount } from "@/server/planGates";
import { accountIdOf, viewerFor } from "@/server/viewer";

// Displays poll this every 30 seconds (and Household walls also long-poll config-watch). The ETag includes the
// settings version, the device's view and instant-refresh eligibility, which can change without a settings save.
export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const preview = viewer.kind === "person" && viewer.session.role === "admin" ? new URL(req.url).searchParams.get("view") : null;
  if (viewer.kind === "person" && !preview) return unauthorized();
  const [{ config, version }, plan] = await Promise.all([loadDisplayConfig(accountId, { fresh: true }), planForAccount(accountId)]);
  const device = viewer.kind === "device" ? viewer.device : null;
  const etag = `"${version}-${device?.viewId ?? preview ?? "auto"}-${plan}"`;
  if (req.headers.get("if-none-match") === etag)
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "no-cache", "X-Display-Release": DISPLAY_ASSET_VERSION },
    });
  return json(displayPayload(config, version, device, preview, { instantRefresh: plan === "paid", brandMark: plan === "free" }), 200, {
    ETag: etag,
    "Cache-Control": "no-cache",
    "X-Display-Release": DISPLAY_ASSET_VERSION,
  });
}
