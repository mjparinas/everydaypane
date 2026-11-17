import * as Sentry from "@sentry/nextjs";

import { scrubEvent } from "@/lib/sentryScrub";

// Server-side error reporting (Melvin, 2026-11-17). Off unless SENTRY_DSN (or NEXT_PUBLIC_SENTRY_DSN, which Vercel's
// Sentry integration sets) is set. No tracing, replay or profiling: errors only, with personal details scrubbed.
export function register() {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn || process.env.NEXT_RUNTIME !== "nodejs") return;
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,

    beforeSend: scrubEvent,
  });
}

export const onRequestError = Sentry.captureRequestError;
