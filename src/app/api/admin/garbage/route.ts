import { z } from "zod";

import { lookupAddress } from "@/server/garbage";
import { json, unauthorized } from "@/server/http";
import { adminFor } from "@/server/viewer";

const params = z.object({
  address: z.string().trim().min(3).max(120),
  projectId: z.string().regex(/^\d{1,10}$/),
  districtId: z.string().regex(/^[A-Za-z0-9_-]{1,20}$/),
});

/** Finds the collection zone for an address (the admin panel's "Find my pickup days"). */
export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const url = new URL(req.url);
  const p = params.safeParse(Object.fromEntries(url.searchParams));
  if (!p.success) return json({ error: "Type a street address" }, 400);
  try {
    return json({ matches: await lookupAddress(p.data.address, p.data.projectId, p.data.districtId) });
  } catch {
    return json({ error: "The Township's collection calendar didn't answer. Try again in a minute." }, 502);
  }
}
