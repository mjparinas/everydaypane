// Security headers on every response. The display needs camera snapshots and photos from our own origin only
// (they're proxied), so img-src stays 'self' plus data: and blob: for the QR code and offline copies.
export const CSP = csp();

/**
 * The policy, optionally letting pictures and video come from one more origin. Display pages pass the home
 * network's go2rtc server (live cameras, Melvin 2026-11-21), so a screen can play it directly; nothing else changes,
 * and no other page gets it.
 */
export function csp(mediaOrigin = ""): string {
  const extra = mediaOrigin ? ` ${mediaOrigin}` : "";
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${extra}`,
    `media-src 'self'${extra}`,
    "font-src 'self'",
    "connect-src 'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

// Every page gets CSP except display pages (/d/<token>/) and the admin's preview of one, which send their own
// (displayHtml), since a header from next.config.ts would replace it.
export const CSP_SOURCES = ["/", "/:path((?!d/[^/]+/?$|admin/preview/[^/]+/?$).*)"];
