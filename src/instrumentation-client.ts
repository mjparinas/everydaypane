import { scrubEvent } from "@/lib/sentryScrub";

// Browser error reporting for the admin panel (the display reports through /api/display/error instead, so it never
// loads Sentry). Off unless NEXT_PUBLIC_SENTRY_DSN is set. The library is only downloaded once something actually
// goes wrong (as in Gradelings), so pages that run cleanly never pay for it.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn && typeof window !== "undefined") {
  const pending: unknown[] = [];
  let loading = false;
  const report = (error: unknown) => {
    pending.push(error);
    if (loading) return;
    loading = true;
    void import("@sentry/nextjs").then((Sentry) => {
      Sentry.init({
        dsn,
        environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
        tracesSampleRate: 0,
        integrations: (defaults) =>
          defaults.filter((i) => ["GlobalHandlers", "Dedupe", "InboundFilters", "FunctionToString", "LinkedErrors"].includes(i.name)),
        beforeSend: scrubEvent,
      });
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      for (const e of pending.splice(0)) Sentry.captureException(e);
    });
  };
  const onError = (e: ErrorEvent) => {
    if (e.error != null) report(e.error);
  };
  const onRejection = (e: PromiseRejectionEvent) => {
    if (e.reason != null) report(e.reason);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
}
