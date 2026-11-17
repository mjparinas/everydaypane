import "server-only";

const ASSET_VERSION = (process.env.NEXT_PUBLIC_COMMIT_SHA || String(Date.now())).slice(0, 12);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/**
 * The display shell. Its settings arrive by fetch (and from the service worker's copy when offline), so this HTML is
 * the same for every load and can be cached whole for offline mode.
 */
export function displayHtml(opts: { token: string | null; title: string; previewView?: string }): Response {
  const v = ASSET_VERSION;
  const data = [`data-v="${esc(v)}"`];
  if (opts.token) data.push(`data-token="${esc(opts.token)}"`);
  if (opts.previewView) data.push(`data-preview="${esc(opts.previewView)}"`);
  const html = `<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#000000">
<title>${esc(opts.title)} · Everydaypane</title>
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/brand/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-icon.png">
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
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
