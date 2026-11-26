import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

import { CSP, SECURITY_HEADERS, SECURITY_HEADERS_PREVIEW } from "./src/lib/securityHeaders";

const nextConfig: NextConfig = {
  trailingSlash: true,
  poweredByHeader: false,
  reactStrictMode: true,
  async redirects() {
    return [{ source: "/blog/setup-unifi-uc-display21/", destination: "/blog/setup-wall-display/", permanent: true }];
  },
  // The display page is plain HTML plus one small script (public/display/), not a React page: see AGENTS.md "Display".
  // Document CSP with a per-request nonce is set in proxy.ts; APIs and /d/ get a baseline CSP here / in displayHtml.
  // /household/preview/ may be framed by the Views tab (SAMEORIGIN); unlocked `/display/` stays DENY.
  headers: async () => [
    { source: "/:path*", headers: SECURITY_HEADERS },
    { source: "/household/preview/:path*", headers: SECURITY_HEADERS_PREVIEW },
    { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: CSP }] },
    { source: "/d/:path*", headers: [{ key: "Content-Security-Policy", value: CSP }] },
    // Versioned shell assets only — not `/display/` or `/display/unlock/` (those must stay cookie-sensitive).
    { source: "/display/display.js", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    {
      source: "/display/:widget(ecoflow|internet|unifi|whiteboard|wildfires|windy|haEntity|oura|airthings|rivers|borderWait|rachio).js",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    },
    { source: "/display/display.css", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    {
      source: "/display/sw.js",
      headers: [
        { key: "Service-Worker-Allowed", value: "/display/" },
        { key: "Cache-Control", value: "no-cache" },
      ],
    },
    { source: "/fonts/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
  ],
  env: {
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "",
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version ?? "0.1.0",
  },
};

// Readable error reports: when SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT are set at build time (Vercel's Sentry
// integration sets them), the build uploads source maps. Otherwise the config is returned untouched (as in Gradelings).
const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT);

export default uploadSourceMaps
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: true,
      sourcemaps: { deleteSourcemapsAfterUpload: true },
    })
  : nextConfig;
