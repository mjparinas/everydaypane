import "server-only";

import { meetsBanner } from "@/lib/alerts";
import type { DashboardConfig } from "@/lib/config/schema";
import type { EmergencyAlert } from "@/lib/display/types";

import { query, run } from "./db";
import { env } from "./env";
import { sendEmail } from "./mail";

// Email when a new strip-worthy alert appears (Melvin, 2026-11-22): one message per alert id to everyone on
// ADMIN_EMAILS and FAMILY_EMAILS, tracked in alert_notified so repeats are never sent.

function recipients(): string[] {
  const emails = new Set([...env.adminEmails(), ...env.familyEmails()]);
  return [...emails];
}

export async function alreadyNotified(id: string): Promise<boolean> {
  return Boolean((await query<{ id: string }>("SELECT id FROM alert_notified WHERE id = ?", [id]))[0]);
}

export async function markNotified(id: string, now = Date.now()): Promise<void> {
  await run("INSERT OR IGNORE INTO alert_notified (id, sent_at) VALUES (?, ?)", [id, now]);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function mailFor(alert: EmergencyAlert): { subject: string; text: string; html: string } {
  const subject = `Everydaypane: ${alert.title}`.slice(0, 180);
  const text = [alert.title, alert.area, alert.description].filter(Boolean).join("\n\n").slice(0, 4000);
  const html = `<p><strong>${esc(alert.title)}</strong></p><p>${esc(alert.area)}</p><p>${esc(alert.description).replace(/\n/g, "<br>")}</p>`;
  return { subject, text, html };
}

/** Sends email for any current strip-worthy alerts that have not been notified yet. */
export async function notifyNewStripAlerts(config: DashboardConfig, alerts: EmergencyAlert[], now = Date.now()): Promise<void> {
  const a = config.alerts;
  if (!a.enabled || !a.notifyEmail) return;
  const worthy = alerts.filter((x) => meetsBanner(x.severity, a.banner));
  if (!worthy.length) return;
  const to = recipients();
  if (!to.length) return;
  for (const alert of worthy) {
    if (await alreadyNotified(alert.id)) continue;
    const mail = mailFor(alert);
    const results = await Promise.all(to.map((email) => sendEmail({ to: email, ...mail })));
    if (results.some(Boolean)) await markNotified(alert.id, now);
  }
}
