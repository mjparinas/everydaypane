import "server-only";

import { env } from "./env";

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Extra headers, e.g. List-Unsubscribe (RFC 8058) on the getting-started emails. */
  headers?: Record<string, string>;
}

const payload = (m: OutgoingMail) => ({
  from: env.mailFrom(),
  to: [m.to],
  subject: m.subject,
  text: m.text,
  html: m.html,
  ...(m.headers ? { headers: m.headers } : {}),
});

/** Sends one email through Resend's API. Without RESEND_API_KEY (local development) the email is printed instead. */
export async function sendEmail(mail: OutgoingMail, send: typeof fetch = fetch): Promise<boolean> {
  const key = env.resendKey();
  if (!key) {
    if (env.isProduction()) return false;
    console.info(`[mail] To ${mail.to}: ${mail.subject}\n${mail.text}`);
    return true;
  }
  const r = await send("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload(mail)),
  });
  return r.ok;
}

/**
 * Up to 100 emails in one request (Resend's batch endpoint), so a busy hour is one call instead of one per address and
 * stays well under Resend's per-second limit. All or nothing: false means none of them went.
 */
export async function sendEmailBatch(mails: OutgoingMail[], idempotencyKey: string, send: typeof fetch = fetch): Promise<boolean> {
  if (!mails.length) return true;
  const key = env.resendKey();
  if (!key) {
    if (env.isProduction()) return false;
    for (const m of mails) console.info(`[mail] To ${m.to}: ${m.subject}`);
    return true;
  }
  const r = await send("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.slice(0, 256) },
    body: JSON.stringify(mails.map(payload)),
  });
  return r.ok;
}
