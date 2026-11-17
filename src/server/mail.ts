import "server-only";

import { env } from "./env";

/** Sends one email through Resend's API. Without RESEND_API_KEY (local development) the email is printed instead. */
export async function sendEmail(
  mail: { to: string; subject: string; text: string; html: string },
  send: typeof fetch = fetch,
): Promise<boolean> {
  const key = env.resendKey();
  if (!key) {
    if (env.isProduction()) return false;
    console.info(`[mail] To ${mail.to}: ${mail.subject}\n${mail.text}`);
    return true;
  }
  const r = await send("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.mailFrom(), to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
  });
  return r.ok;
}
