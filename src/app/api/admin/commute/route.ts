import { z } from "zod";

import { findPlace } from "@/server/commute";
import { loadConfig } from "@/server/config";
import { env } from "@/server/env";
import { json, unauthorized } from "@/server/http";
import { adminFor } from "@/server/viewer";

const address = z.string().trim().min(3).max(120);

/**
 * Settings › Commute: with no address, whether TOMTOM_API_KEY is set; with one, the places matching it (nearest the
 * dashboard's location first), so the admin can pick home and each destination.
 */
export async function GET(req: Request) {
  if (!(await adminFor(req))) return unauthorized();
  const ready = Boolean(env.tomtomKey());
  const raw = new URL(req.url).searchParams.get("address");
  if (raw === null) return json({ ready });
  if (!ready) return json({ error: "Add TOMTOM_API_KEY in Vercel first (see docs/commute.md)." }, 503);
  const p = address.safeParse(raw);
  if (!p.success) return json({ error: "Type an address" }, 400);
  try {
    return json({ matches: await findPlace(p.data, (await loadConfig()).config.location) });
  } catch {
    return json({ error: "TomTom didn't answer. Try again in a minute." }, 502);
  }
}
