import { displayHtml } from "@/server/displayHtml";
import { adminFor } from "@/server/viewer";

// Always fresh: each viewId must get its own data-preview (never a cached sibling view).
export const dynamic = "force-dynamic";

// The admin's live preview of one view: the real display page, reading settings with the admin's session.
export async function GET(req: Request, ctx: { params: Promise<{ viewId: string }> }) {
  const { viewId } = await ctx.params;
  if (!(await adminFor(req))) {
    const next = `/admin/preview/${encodeURIComponent(viewId)}/`;
    return Response.redirect(new URL(`/signin/?next=${encodeURIComponent(next)}`, req.url), 303);
  }
  const mode = new URL(req.url).searchParams.get("mode");
  const previewMode = mode === "day" || mode === "night" ? mode : undefined;
  return displayHtml({ token: null, title: "Preview", previewView: viewId, previewMode });
}
