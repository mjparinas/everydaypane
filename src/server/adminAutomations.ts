import "server-only";

import { BRAND } from "@/lib/brand";
import { emailHtml } from "@/lib/email";

import { getSetting, setSetting } from "./adminSettings";
import { derivedTodo } from "./adminTodo";
import { query } from "./db";
import { env } from "./env";
import { sendEmail } from "./mail";

export type AutomationSettings = {
  newPurchase: boolean;
  refund: boolean;
  report: boolean;
  morningDigest: boolean;
  /** Getting-started emails to new households (src/server/onboarding.ts). */
  onboarding: boolean;
};

const DEFAULTS: AutomationSettings = {
  newPurchase: true,
  refund: true,
  report: true,
  morningDigest: true,
  onboarding: true,
};

export async function getAutomations(): Promise<AutomationSettings> {
  return { ...DEFAULTS, ...(await getSetting<Partial<AutomationSettings>>("automations", {})) };
}

export async function saveAutomations(next: Partial<AutomationSettings>) {
  const cur = await getAutomations();
  const merged = { ...cur, ...next };
  await setSetting("automations", merged);
  return merged;
}

export async function sendTestAutomationEmail() {
  const to = [...env.adminEmails()][0];
  if (!to) throw new Error("No ADMIN_EMAILS");
  const ok = await sendEmail({
    to,
    subject: `${BRAND.name} admin: test alert`,
    text: `This is a test automation email from the ${BRAND.name} admin panel.`,
    html: emailHtml({
      preheader: "Test automation email",
      title: "Test Alert",
      bodyHtml: `<p style="margin:0">Automations are working. You can turn kinds on and off on the Automations tab.</p>`,
    }),
  });
  if (!ok) throw new Error("Couldn't send");
}

export async function sendMorningDigest(now = Date.now()) {
  const settings = await getAutomations();
  if (!settings.morningDigest) return { sent: false, reason: "off" };
  const dayKey = new Date(now).toISOString().slice(0, 10);
  const claimed = await getSetting<string | null>("digest-sent", null);
  if (claimed === dayKey) return { sent: false, reason: "already" };
  const since = now - 86_400_000;
  const signups = Number((await query<{ n: number }>("SELECT COUNT(*) AS n FROM accounts WHERE created_at >= ?", [since]))[0]?.n ?? 0);
  const paid = Number((await query<{ n: number }>("SELECT COUNT(*) AS n FROM accounts WHERE plan = 'paid'"))[0]?.n ?? 0);
  const reports = Number((await query<{ n: number }>("SELECT COUNT(*) AS n FROM problem_reports WHERE status = 'open'"))[0]?.n ?? 0);
  const todo = await derivedTodo();
  const recipients = [...env.adminEmails()];
  if (!recipients.length) return { sent: false, reason: "no recipients" };
  const body = `Last 24 hours: ${signups} sign-ups. ${paid} Household plans. ${reports} open reports. ${todo.length} to do.`;
  for (const to of recipients) {
    await sendEmail({
      to,
      subject: `Today: ${todo.length} to do — ${BRAND.name}`,
      text: body,
      html: emailHtml({
        preheader: body,
        title: "Morning Digest",
        bodyHtml: `<p style="margin:0 0 12px">${body}</p><p style="margin:0"><a href="${env.siteUrl()}/admin/">Open the admin panel</a></p>`,
      }),
    });
  }
  await setSetting("digest-sent", dayKey, now);
  return { sent: true };
}
