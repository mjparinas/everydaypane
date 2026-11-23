import { editPageUrl } from "@/lib/editPage";
import { deviceToken } from "@/server/devices";
import { notFound, unauthorized } from "@/server/http";
import { adminFor } from "@/server/viewer";
import { qrSvg } from "@/server/wifi";

/** SVG QR for a display's phone edit page, for the Displays tab (Melvin, 2026-11-22). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const token = await deviceToken(session.accountId, (await ctx.params).id);
  if (!token) return notFound();
  const url = editPageUrl(new URL(req.url).origin, token);
  return new Response(qrSvg(url), {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=60" },
  });
}
