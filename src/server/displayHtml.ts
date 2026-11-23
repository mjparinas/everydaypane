import "server-only";

import { CSP, CSP_PREVIEW } from "@/lib/securityHeaders";

const ASSET_VERSION = (process.env.NEXT_PUBLIC_COMMIT_SHA || String(Date.now())).slice(0, 12);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/**
 * The display shell. Its settings arrive by fetch (and from the service worker's copy when offline), so this HTML is
 * the same for every load and can be cached whole for offline mode.
 *
 * Admin preview pages allow same-origin framing so the Views tab can embed a live draft (Melvin, 2026-11-22).
 * Wall /d/… pages stay unframeable.
 */
export function displayHtml(opts: {
  token: string | null;
  title: string;
  previewView?: string;
  previewMode?: "day" | "night";
  /** Extra response headers (e.g. the short-lived display cookie for image routes). */
  headers?: Record<string, string>;
}): Response {
  const v = ASSET_VERSION;
  const data = [`data-v="${esc(v)}"`];
  if (opts.token) data.push(`data-token="${esc(opts.token)}"`);
  if (opts.previewView) data.push(`data-preview="${esc(opts.previewView)}"`);
  if (opts.previewMode) data.push(`data-preview-mode="${esc(opts.previewMode)}"`);
  const preview = Boolean(opts.previewView);
  const html = `<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#000000">
<title>${esc(opts.title)} · Everydaypane</title>
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="icon" href="/icons/icon-32.png" type="image/png" sizes="32x32">
<link rel="icon" href="/icons/icon-16.png" type="image/png" sizes="16x16">
<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon-167.png" sizes="167x167">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon-152.png" sizes="152x152">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon-120.png" sizes="120x120">
<link rel="mask-icon" href="/brand/safari-pinned.svg" color="#3b5bdb">
<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/display/display.css?v=${v}">
<script type="module" src="/display/display.js?v=${v}"></script>
</head>
<body ${data.join(" ")}>
<div id="app" class="boot"><div class="boot-logo" aria-hidden="true"></div></div>
<noscript>This display needs JavaScript.</noscript>
</body>
</html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      "Content-Security-Policy": preview ? CSP_PREVIEW : CSP,
      // Override next.config's DENY so the admin can embed this preview same-origin.
      ...(preview ? { "X-Frame-Options": "SAMEORIGIN" } : {}),
      ...opts.headers,
    },
  });
}
