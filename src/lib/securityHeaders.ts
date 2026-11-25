// Security headers on every response. The display needs camera snapshots and photos from our own origin only
// (they're proxied), so img-src stays 'self' plus data: and blob: for the QR code and offline copies. The one page from
// Earth, TradingView, YouTube, Vimeo, Google Maps and Instagram embeds need their origins in frame-src; 'self' is also
// allowed so the admin Views tab can embed /household/preview/ (Melvin, 2026-11-22: live draft preview).
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
  /**
   * When the page itself was served over HTTPS. Off for http://localhost e2e/dev — otherwise the browser upgrades
   * every asset to https://localhost and Chromium logs net::ERR_SSL_PROTOCOL_ERROR (plain HTTP has no cert).
   */
  upgradeInsecureRequests?: boolean;
}): string {
  const isDev = process.env.NODE_ENV === "development";
  // Dev-only allowance so impeccable live mode can load. Never reaches production.
  const impeccableLiveDev = isDev ? " http://localhost:8400" : "";
  const script =
    opts.script === "nonce" && opts.nonce
      ? `'self' 'nonce-${opts.nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}${impeccableLiveDev}`
      : `'self'${isDev ? " 'unsafe-eval'" : ""}${impeccableLiveDev}`;
  // Clerk Frontend API (and Cloudflare Turnstile challenges) when not fully proxied through /__clerk.
  const clerkScript = "https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com";
  const clerkConnect =
    "https://*.clerk.accounts.dev https://*.clerk.com https://api.clerk.com https://clerk-telemetry.com https://challenges.cloudflare.com";
  const clerkFrame = "https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com";
  const directives = [
    "default-src 'self'",
    `script-src ${script} ${clerkScript}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://img.clerk.com",
    "font-src 'self'",
    `connect-src 'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io ${clerkConnect}${impeccableLiveDev}`,
    [
      "frame-src 'self'",
      clerkFrame,
      "https://earth.nullschool.net",
      "https://s.tradingview.com",
      "https://www.tradingview-widget.com",
      "https://www.youtube.com",
      "https://www.youtube-nocookie.com",
      "https://player.vimeo.com",
      "https://www.google.com",
      "https://maps.google.com",
      "https://www.instagram.com",
    ].join(" "),
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    `frame-ancestors ${opts.frameAncestors ?? "'none'"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  if (opts.upgradeInsecureRequests !== false) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** Baseline CSP (no nonce): APIs, the display shell, and anything that isn't a Next.js document. */
export const CSP = contentSecurityPolicy({ script: "self" });

/** Admin preview shell: same as CSP, but the Views tab may embed it same-origin. */
export const CSP_PREVIEW = contentSecurityPolicy({ script: "self", frameAncestors: "'self'" });

/** Display/preview CSP with upgrade-insecure-requests only when the page was served over HTTPS. */
export function displayCsp(opts: { preview: boolean; https: boolean }): string {
  return contentSecurityPolicy({
    script: "self",
    frameAncestors: opts.preview ? "'self'" : "'none'",
    upgradeInsecureRequests: opts.https,
  });
}

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
