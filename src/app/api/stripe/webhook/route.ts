import { handleStripeWebhook } from "@/server/billing";
import { json } from "@/server/http";

export const runtime = "nodejs";

/** Stripe subscription lifecycle. Raw body required for signature verification. */
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "Missing signature" }, 400);
  const rawBody = await req.text();
  try {
    await handleStripeWebhook(rawBody, signature);
    return json({ received: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Webhook failed" }, 400);
  }
}
