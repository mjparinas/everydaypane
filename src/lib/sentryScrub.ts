import type { ErrorEvent } from "@sentry/nextjs";

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const TOKENS = /([?&](?:t|token|code)=)[^&#\s]+|(\/d\/)[A-Za-z0-9_-]{16,}/g;

/** Takes email addresses, display tokens, sign-in links and cookies out of an error report before it leaves. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const clean = (s: string) => s.replace(EMAIL, "[email]").replace(TOKENS, (_m, q?: string, d?: string) => `${q ?? d ?? ""}[redacted]`);
  if (event.message) event.message = clean(event.message);
  for (const ex of event.exception?.values ?? []) if (ex.value) ex.value = clean(ex.value);
  if (event.request) {
    if (event.request.url) event.request.url = clean(event.request.url);
    delete event.request.cookies;
    if (event.request.headers) {
      delete event.request.headers.cookie;
      delete event.request.headers.Cookie;
      delete event.request.headers["x-display-token"];
    }
    if (typeof event.request.query_string === "string") event.request.query_string = clean(event.request.query_string);
  }
  delete event.user;
  return event;
}
