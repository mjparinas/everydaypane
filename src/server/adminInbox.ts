import "server-only";

import { env } from "./env";

/** Resend receiving inbox — configured when RESEND_INBOX_API_KEY is set (Liftsmith pattern). */
export async function inboxSummary() {
  if (!env.resendInboxKey()) {
    return {
      configured: false,
      waiting: 0,
      messages: [] as unknown[],
      setup: [
        "Create a Resend receiving domain for everydaypane.com (MX).",
        "Set RESEND_INBOX_API_KEY to a full-access Resend key (sending-only RESEND_API_KEY is not enough).",
        "Optional: INBOX_DOMAINS=everydaypane.com",
      ],
    };
  }
  // Live Resend receiving list can be wired once the domain receives mail; until then show configured + empty.
  return {
    configured: true,
    waiting: 0,
    messages: [] as unknown[],
    setup: [] as string[],
    note: "Inbox is connected. New mail to your receiving domain will show here once listing is enabled for this key.",
  };
}
