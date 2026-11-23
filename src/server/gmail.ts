import "server-only";

import { z } from "zod";

import type { EmailCountData } from "@/lib/display/types";

import { cached, forget } from "./cache";
import { accessToken, GMAIL_SCOPE } from "./google";

// Gmail unread count (Phase 5): gmail.readonly on the existing Google connection.
const TTL = 2 * 60_000;

export class GmailDisconnected extends Error {
  constructor() {
    super("Connect Gmail under Settings");
  }
}

export async function gmailGranted(accountId: string): Promise<boolean> {
  const { getSecret } = await import("./secrets");
  const scopes = (await getSecret(accountId, "google.scopes"))?.split(" ") ?? [];
  return scopes.includes(GMAIL_SCOPE);
}

const labelSchema = z.object({
  labels: z.array(z.object({ id: z.string(), name: z.string().optional(), messagesUnread: z.number().optional() })).default([]),
});

export async function emailCountFeed(accountId: string): Promise<EmailCountData> {
  const key = `gmail:${accountId}`;
  const { value, fetchedAt, stale } = await cached(key, TTL, async () => {
    const scopes = await gmailGranted(accountId);
    if (!scopes) throw new GmailDisconnected();
    const token = await accessToken(accountId);
    const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (r.status === 401) throw new GmailDisconnected();
    if (!r.ok) throw new Error(`Gmail answered ${r.status}`);
    const inbox = labelSchema.parse(await r.json()).labels.find((l) => l.id === "INBOX" || l.name === "INBOX");
    return { unread: inbox?.messagesUnread ?? 0 };
  });
  return { updatedAt: fetchedAt, stale, connected: true, unread: (value as { unread: number }).unread };
}

export async function forgetGmail(accountId: string): Promise<void> {
  await forget(`gmail:${accountId}`);
}
