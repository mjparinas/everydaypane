import { NextResponse, type NextRequest } from "next/server";

import { authTestMode, clerkConfigured, TEST_SESSION_COOKIE } from "@/lib/authFlags";
import { contentSecurityPolicy } from "@/lib/securityHeaders";
import { signInHref } from "@/lib/site";

// Clerk session attach + CSP nonce. Protects /household, /admin and /family with a fast cookie/session check;
// every page and API still re-checks membership itself. Wall `/display/` unlock stays outside this gate.

function requestIsHttps(req: NextRequest): boolean {
  const forwarded = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwarded) return forwarded === "https";
  return req.nextUrl.protocol === "https:";
}

function withCsp(req: NextRequest, build: (headers: Headers) => NextResponse): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy({
    nonce,
    script: "nonce",
    upgradeInsecureRequests: requestIsHttps(req),
  });
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = build(requestHeaders);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

function needsAuthPath(path: string): boolean {
  return path.startsWith("/household") || path.startsWith("/admin") || path.startsWith("/family");
}

function hasTestSession(req: NextRequest): boolean {
  return authTestMode() && req.cookies.has(TEST_SESSION_COOKIE);
}

function redirectToSignIn(req: NextRequest): NextResponse {
  const target = signInHref(req.nextUrl.pathname);
  if (target.startsWith("http")) return withCsp(req, () => NextResponse.redirect(target));
  const url = req.nextUrl.clone();
  const parsed = new URL(target, req.nextUrl.origin);
  url.pathname = parsed.pathname;
  url.search = parsed.search;
  return withCsp(req, () => NextResponse.redirect(url));
}

function gate(req: NextRequest, signedIn: boolean): NextResponse {
  const path = req.nextUrl.pathname;
  // Clerk still attaches the session. The preview route checks household membership and sets the display shell CSP.
  if (/^\/household\/preview\/[^/]+\/?$/.test(path)) return NextResponse.next();
  if (needsAuthPath(path) && !signedIn && !hasTestSession(req)) {
    return redirectToSignIn(req);
  }
  return withCsp(req, (requestHeaders) => NextResponse.next({ request: { headers: requestHeaders } }));
}

type Middleware = (req: NextRequest, event: unknown) => unknown;

let clerkProxy: Middleware | null = null;

async function loadClerkProxy(): Promise<Middleware> {
  if (clerkProxy) return clerkProxy;
  const { clerkMiddleware } = await import("@clerk/nextjs/server");
  // CNAME Frontend API (clerk.everydaypane.com). A same-origin /__clerk proxy without a Dashboard
  // proxy URL makes Clerk answer host_invalid (Melvin, 2026-11-24).
  clerkProxy = clerkMiddleware(async (auth, req) => {
    const { userId } = await auth();
    return gate(req, Boolean(userId));
  }) as Middleware;
  return clerkProxy;
}

export default async function proxy(req: NextRequest, event: unknown) {
  if (clerkConfigured()) {
    const mw = await loadClerkProxy();
    return mw(req, event);
  }
  return gate(req, hasTestSession(req));
}

export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|d/[^/]+/?$|household/preview/|display/?$|display/display\\.(?:js|css)|display/sw\\.js|brand/|fonts/|icons/|favicon.ico|icon.svg|apple-icon.png|apple-touch-icon.png|manifest.webmanifest|.*\\..*).*)",
    "/household/preview/:viewId",
    "/(api|trpc)(.*)",
  ],
};
