import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

import { SECURITY_HEADERS } from "./src/lib/securityHeaders";

const nextConfig: NextConfig = {
  trailingSlash: true,
  poweredByHeader: false,
  reactStrictMode: true,
  // The display page is plain HTML plus one small script (public/display/), not a React page: see AGENTS.md "Display".
  headers: async () => [
    { source: "/:path*", headers: SECURITY_HEADERS },
    { source: "/display/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=300, stale-while-revalidate=86400" }] },
  ],
  env: { NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "" },
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
