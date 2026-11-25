import { BRAND } from "./brand";
import { SITE_URL } from "./site";

// Branded transactional email chrome (Melvin, 2026-11-23): every outbound Resend message uses the same layout,
// colours and wordmark as the marketing site so sign-in and alert mail look trustworthy and on-brand.

/** Colours from `src/app/globals.css` `@theme`, kept literal for email clients that ignore CSS variables. */
export const EMAIL = {
  bg: "#f6f7fb",
  panel: "#ffffff",
  line: "#e4e7ef",
  ink: "#0f172a",
  soft: "#526077",
  brand: "#3b5bdb",
  brandInk: "#ffffff",
  sun: "#f59e0b",
  good: "#2b8a3e",
  bad: "#c92a2a",
  /** Darker brand for the header bar gradient end. */
  brandDeep: "#2a3796",
} as const;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function markUrl(): string {
  return `${SITE_URL}/icons/icon-64.png`;
}

function wordmarkHtml(): string {
  return `<span style="font-family:'Manrope',Arial,Helvetica,sans-serif;font-size:20px;font-weight:800;letter-spacing:-0.02em;color:${EMAIL.ink}">everyday<span style="color:${EMAIL.brand}">pane</span></span>`;
}

function ctaButton(href: string, label: string): string {
  const safe = escapeHtml(href);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px">
  <tr>
    <td align="center" bgcolor="${EMAIL.brand}" style="border-radius:14px;background:${EMAIL.brand}">
      <a href="${safe}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:1.2;color:${EMAIL.brandInk};text-decoration:none;border-radius:14px">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

export type EmailBody = {
  /** Hidden inbox preview line. */
  preheader: string;
  /** Main heading inside the card. */
  title: string;
  /** HTML for the body (already escaped / trusted fragments). */
  bodyHtml: string;
  /** Optional primary button. */
  cta?: { href: string; label: string };
  /** Optional note under the CTA (muted). */
  footnote?: string;
  /** Accent bar colour under the header (brand by default). */
  accent?: string;
};

/**
 * Full HTML document for a transactional email: soft page background, white card, brand header with mark and
 * wordmark, accent strip, body, optional CTA, and a quiet footer with the tagline and site link.
 */
export function emailHtml(body: EmailBody): string {
  const accent = body.accent ?? EMAIL.brand;
  const pre = escapeHtml(body.preheader);
  const title = escapeHtml(body.title);
  const footnote = body.footnote
    ? `<p style="margin:20px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${EMAIL.soft}">${escapeHtml(body.footnote)}</p>`
    : "";
  const cta = body.cta ? ctaButton(body.cta.href, body.cta.label) : "";
  const year = new Date().getFullYear();
  const home = escapeHtml(SITE_URL);

  return `<!DOCTYPE html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${EMAIL.bg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${EMAIL.bg}">${pre}${"\u00a0".repeat(80)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${EMAIL.bg}">
  <tr>
    <td align="center" style="padding:32px 16px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:${EMAIL.panel};border:1px solid ${EMAIL.line};border-radius:20px;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,0.06)">
        <tr>
          <td style="padding:22px 28px 18px;background:linear-gradient(135deg,${EMAIL.brand} 0%,${EMAIL.brandDeep} 100%);background-color:${EMAIL.brand}">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:middle;padding-right:12px">
                  <img src="${escapeHtml(markUrl())}" width="40" height="40" alt="" style="display:block;border:0;border-radius:10px;outline:none">
                </td>
                <td style="vertical-align:middle">
                  <span style="font-family:'Manrope',Arial,Helvetica,sans-serif;font-size:20px;font-weight:800;letter-spacing:-0.02em;color:#ffffff">everyday<span style="color:#ffd76a">pane</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="height:4px;line-height:4px;font-size:0;background:${accent}">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:28px 28px 8px">
            <h1 style="margin:0 0 14px;font-family:'Manrope',Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;line-height:1.25;color:${EMAIL.ink};letter-spacing:-0.02em">${title}</h1>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:${EMAIL.ink}">${body.bodyHtml}</div>
            ${cta}
            ${footnote}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 28px 28px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="border-top:1px solid ${EMAIL.line};padding-top:18px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${EMAIL.soft}">
                  ${wordmarkHtml()} · ${escapeHtml(BRAND.tagline)}<br>
                  <a href="${home}" style="color:${EMAIL.brand};text-decoration:none">${home.replace(/^https?:\/\//, "")}</a>
                  <span style="color:${EMAIL.line}"> · </span>
                  © ${year} ${escapeHtml(BRAND.name)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

const severityAccent: Record<string, string> = {
  extreme: EMAIL.bad,
  severe: EMAIL.bad,
  moderate: EMAIL.sun,
  minor: EMAIL.soft,
  unknown: EMAIL.brand,
};

/** Emergency alert notification email. */
export function alertEmail(alert: { title: string; area: string; description: string; severity: string }): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = `${BRAND.name}: ${alert.title}`.slice(0, 180);
  const text = [alert.title, alert.area, alert.description, "", `— ${BRAND.name}`, SITE_URL].filter(Boolean).join("\n\n").slice(0, 4000);
  const area = alert.area.trim()
    ? `<p style="margin:0 0 12px;font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${EMAIL.soft}">${escapeHtml(alert.area)}</p>`
    : "";
  const desc = escapeHtml(alert.description).replace(/\n/g, "<br>");
  return {
    subject,
    text,
    html: emailHtml({
      preheader: [alert.area, alert.title].filter(Boolean).join(" · ").slice(0, 140),
      title: alert.title,
      accent: severityAccent[alert.severity] ?? EMAIL.brand,
      bodyHtml: `${area}<p style="margin:0">${desc}</p>`,
      footnote: "You're getting this because alert email is on in Everydaypane Settings.",
    }),
  };
}
