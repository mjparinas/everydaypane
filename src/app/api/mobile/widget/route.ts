import { json, unauthorized } from "@/server/http";
import { deviceForRequest } from "@/server/mobile";
import { widgetSummaryFor } from "@/server/mobileWidget";

// Home-screen widgets on iOS and Android read this with the app token (no cookies outside the app's web page).
export async function GET(req: Request) {
  const device = await deviceForRequest(req);
  if (!device) return unauthorized();
  return json(await widgetSummaryFor(device.accountId));
}
