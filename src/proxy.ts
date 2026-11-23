import { NextResponse, type NextRequest } from "next/server";

import { contentSecurityPolicy } from "@/lib/securityHeaders";

// Sends people without a session cookie from the admin panel to sign-in. Only a fast first check: every admin page
// and API route checks the session itself (src/server/viewer.ts).
//
// Also stamps a per-request CSP nonce onto Next.js documents so script-src can drop 'unsafe-inline' (Next applies the
// nonce to its own scripts when it sees Content-Security-Policy on the request).

function withCsp(req: NextRequest, build: (headers: Headers) => NextResponse): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy({ nonce, script: "nonce" });
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = build(requestHeaders);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const needsAuth = path.startsWith("/admin") || path.startsWith("/family");

  if (needsAuth && !req.cookies.has("ep_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin/";
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return withCsp(req, () => NextResponse.redirect(url));
  }

  return withCsp(req, (requestHeaders) => NextResponse.next({ request: { headers: requestHeaders } }));
}

// HTML documents (not /d/ or /admin/preview/, which set their own CSP in displayHtml; not APIs or static assets).
export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|d/|admin/preview/|display/|brand/|fonts/|favicon.ico|icon.svg|apple-icon.png|.*\\..*).*)"],
};
