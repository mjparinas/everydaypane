import { BRAND } from "@/lib/brand";
import { EMAIL, escapeHtml } from "@/lib/email";
import { unsubscribe, validUnsubscribe } from "@/server/onboarding";

// The unsubscribe link in the getting-started emails. Opening it shows a button that POSTs (mail scanners open links,
// so a GET never unsubscribes anyone); mail apps' one-click unsubscribe (RFC 8058) POSTs here directly. The HMAC in
// `t` is the proof, so this route doesn't ask for our origin or a sign-in.

function page(title: string, body: string, form?: { e: string; t: string }, status = 200): Response {
  const button = form
    ? `<form method="post" action="/api/email/unsubscribe/?e=${encodeURIComponent(form.e)}&amp;t=${encodeURIComponent(form.t)}"><button type="submit" style="min-height:48px;padding:0 22px;border:0;border-radius:14px;background:${EMAIL.brand};color:#fff;font-size:16px;font-weight:700;cursor:pointer">Unsubscribe</button></form>`
    : "";
  const html = `<!doctype html><html lang="en-CA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} · ${BRAND.name}</title></head>
<body style="margin:0;background:${EMAIL.bg};color:${EMAIL.ink};font-family:Arial,Helvetica,sans-serif"><main style="max-width:480px;margin:0 auto;padding:48px 20px">
<p style="font-weight:800;font-size:20px">everyday<span style="color:${EMAIL.brand}">pane</span></p><h1 style="font-size:24px">${escapeHtml(title)}</h1><p style="font-size:16px;line-height:1.5;color:${EMAIL.soft}">${escapeHtml(body)}</p>${button}
</main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function params(req: Request): { e: string; t: string } {
  const url = new URL(req.url);
  return { e: (url.searchParams.get("e") ?? "").trim().toLowerCase(), t: url.searchParams.get("t") ?? "" };
}

export function GET(req: Request) {
  const p = params(req);
  if (!validUnsubscribe(p.e, p.t))
    return page("That link doesn't work", "It may have been cut off. Use the link at the bottom of the latest email.", undefined, 400);
  return page(
    "Stop the getting-started tips?",
    `We'll stop sending tips to ${p.e}. Alerts you asked for and account email aren't affected.`,
    p,
  );
}

export async function POST(req: Request) {
  const p = params(req);
  if (!validUnsubscribe(p.e, p.t))
    return page("That link doesn't work", "It may have been cut off. Use the link at the bottom of the latest email.", undefined, 400);
  await unsubscribe(p.e);
  return page("You're unsubscribed", "No more getting-started tips. Everything on your wall keeps working as before.");
}
