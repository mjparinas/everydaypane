import { displayHtml } from "@/server/displayHtml";
import { adminFor } from "@/server/viewer";

// The admin's live preview of one view: the real display page, reading settings with the admin's session.
export async function GET(req: Request, ctx: { params: Promise<{ viewId: string }> }) {
  if (!(await adminFor(req))) return Response.redirect(new URL("/signin/?next=/admin/", req.url), 303);
  const { viewId } = await ctx.params;
  const mode = new URL(req.url).searchParams.get("mode");
  const previewMode = mode === "day" || mode === "night" ? mode : undefined;
  return displayHtml({ token: null, title: "Preview", previewView: viewId, previewMode });
}
