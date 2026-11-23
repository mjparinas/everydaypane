import { deviceForToken } from "@/server/devices";
import { displayCookieHeader } from "@/server/displayAuth";
import { displayHtml } from "@/server/displayHtml";

// A display's page: plain HTML and one small script, no React (AGENTS.md "Display: super lightweight").
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const device = await deviceForToken(token);
  if (!device) return new Response("This display isn't set up. Add it in the admin panel under Devices.", { status: 404 });
  return displayHtml({
    token,
    title: device.name,
    requestUrl: req.url,
    headers: { "Set-Cookie": displayCookieHeader(token) },
  });
}
