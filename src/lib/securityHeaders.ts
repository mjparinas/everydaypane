// Security headers on every response. The display needs camera snapshots and photos from our own origin only
// (they're proxied), so img-src stays 'self' plus data: and blob: for the QR code and offline copies. The one page from
// elsewhere is the earth wind map widget's frame (src/lib/earth.ts), so frame-src names that site; 'self' is also
// allowed so the admin Views tab can embed /admin/preview/ (Melvin, 2026-11-22: live draft preview).
//
// script-src never allows 'unsafe-inline': Next.js pages get a per-request nonce from proxy.ts; the display shell only
// loads /display/display.js from our origin (src/server/displayHtml.ts). style-src still needs 'unsafe-inline' because
// both the admin panel and the display set style attributes (theme colours, grid placement).
//
// Wall displays (/d/…) stay unframeable (frame-ancestors 'none'). Admin preview HTML allows frame-ancestors 'self'
// so the Views tab can show a live draft without opening a new tab.

export function contentSecurityPolicy(opts: {
  nonce?: string;
  script: "nonce" | "self";
  /** Who may embed this document. Default: nobody. Preview pages use 'self'. */
  frameAncestors?: "'none'" | "'self'";
}): string {
  const isDev = process.env.NODE_ENV === "development";
  const script =
    opts.script === "nonce" && opts.nonce
      ? `'self' 'nonce-${opts.nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`
      : `'self'${isDev ? " 'unsafe-eval'" : ""}`;
  return [
    "default-src 'self'",
    `script-src ${script}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
    "frame-src 'self' https://earth.nullschool.net",
    "worker-src 'self'",
    "manifest-src 'self'",
    `frame-ancestors ${opts.frameAncestors ?? "'none'"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/** Baseline CSP (no nonce): APIs, the display shell, and anything that isn't a Next.js document. */
export const CSP = contentSecurityPolicy({ script: "self" });

/** Admin preview shell: same as CSP, but the Views tab may embed it same-origin. */
export const CSP_PREVIEW = contentSecurityPolicy({ script: "self", frameAncestors: "'self'" });

/** Headers that don't need a per-request nonce. CSP for HTML documents is set in proxy.ts / displayHtml. */
export const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

/** Same as SECURITY_HEADERS, but allow same-origin framing (admin live preview). */
export const SECURITY_HEADERS_PREVIEW = SECURITY_HEADERS.map((h) =>
  h.key === "X-Frame-Options" ? { key: "X-Frame-Options", value: "SAMEORIGIN" } : h,
);
