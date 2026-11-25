import { verifyWebhook } from "@clerk/backend/webhooks";

import { createAccount } from "@/server/accounts";
import { env } from "@/server/env";

/**
 * Clerk `user.created`: seed a Free household when the email is new.
 * Household name comes from `unsafeMetadata.householdName` (signup form) or defaults to "Home".
 * Existing `account_members` rows are left alone (invite / grandfather).
 */
export async function POST(req: Request) {
  if (!env.clerkWebhookSecret() && !env.clerkSecretKey()) {
    return new Response("Clerk webhooks not configured", { status: 503 });
  }
  let evt;
  try {
    evt = await verifyWebhook(req, { signingSecret: env.clerkWebhookSecret() || undefined });
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (evt.type === "user.created") {
    const data = evt.data;
    const email =
      data.email_addresses.find((a) => a.id === data.primary_email_address_id)?.email_address?.toLowerCase() ??
      data.email_addresses[0]?.email_address?.toLowerCase();
    if (email) {
      const meta = data.unsafe_metadata as { householdName?: unknown } | null;
      const name = typeof meta?.householdName === "string" && meta.householdName.trim() ? meta.householdName.trim() : "Home";
      await createAccount(name, email);
    }
  }

  return new Response("ok", { status: 200 });
}
