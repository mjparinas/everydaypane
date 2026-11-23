import { z } from "zod";

import { json, unauthorized } from "@/server/http";
import { findPlaces } from "@/server/places";
import { adminFor } from "@/server/viewer";

const name = z.string().trim().min(2).max(80);

/** Towns and cities matching a name, for a widget centred on a place (the earth wind map). */
export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const p = name.safeParse(new URL(req.url).searchParams.get("q"));
  if (!p.success) return json({ error: "Type a town or city" }, 400);
  try {
    return json({ matches: await findPlaces(p.data) });
  } catch {
    return json({ error: "The place search didn't answer. Try again in a minute." }, 502);
  }
}
