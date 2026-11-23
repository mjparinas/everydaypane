import "server-only";

import { meetsBanner } from "@/lib/alerts";
import type { DashboardConfig } from "@/lib/config/schema";
import type { EmergencyAlert } from "@/lib/display/types";

import { ensureAccountsSeeded } from "./accounts";
import { query, run } from "./db";
import { sendEmail } from "./mail";

// Email when a new strip-worthy alert appears (Melvin, 2026-11-22): one message per alert id to household members,
// tracked in account_alert_notified so repeats are never sent.

export async function alreadyNotified(accountId: string, id: string): Promise<boolean> {
  return Boolean(
    (await query<{ id: string }>("SELECT id FROM account_alert_notified WHERE account_id = ? AND id = ?", [accountId, id]))[0],
  );
}

export async function markNotified(accountId: string, id: string, now = Date.now()): Promise<void> {
  await run("INSERT OR IGNORE INTO account_alert_notified (account_id, id, sent_at) VALUES (?, ?, ?)", [accountId, id, now]);
}

async function recipients(accountId: string): Promise<string[]> {
  await ensureAccountsSeeded();
  const rows = await query<{ email: string }>("SELECT email FROM account_members WHERE account_id = ?", [accountId]);
  return [...new Set(rows.map((r) => r.email))];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function mailFor(alert: EmergencyAlert): { subject: string; text: string; html: string } {
  const subject = `Everydaypane: ${alert.title}`.slice(0, 180);
  const text = [alert.title, alert.area, alert.description].filter(Boolean).join("\n\n").slice(0, 4000);
  const html = `<p><strong>${esc(alert.title)}</strong></p><p>${esc(alert.area)}</p><p>${esc(alert.description).replace(/\n/g, "<br>")}</p>`;
  return { subject, text, html };
}

/** Sends email for any current strip-worthy alerts that have not been notified yet. */
export async function notifyNewStripAlerts(
  accountId: string,
  config: DashboardConfig,
  alerts: EmergencyAlert[],
  now = Date.now(),
): Promise<void> {
  const a = config.alerts;
  if (!a.enabled || !a.notifyEmail) return;
  const worthy = alerts.filter((x) => meetsBanner(x.severity, a.banner));
  if (!worthy.length) return;
  const to = await recipients(accountId);
  if (!to.length) return;
  for (const alert of worthy) {
    if (await alreadyNotified(accountId, alert.id)) continue;
    const mail = mailFor(alert);
    const results = await Promise.all(to.map((email) => sendEmail({ to: email, ...mail })));
    if (results.some(Boolean)) await markNotified(accountId, alert.id, now);
  }
}
