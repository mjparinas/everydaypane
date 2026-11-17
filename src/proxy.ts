import { NextResponse, type NextRequest } from "next/server";

// Sends people without a session cookie from the admin panel to sign-in. Only a fast first check: every admin page
// and API route checks the session itself (src/server/viewer.ts).
export function proxy(req: NextRequest) {
  if (!req.cookies.has("ep_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin/";
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*", "/family/:path*"] };
