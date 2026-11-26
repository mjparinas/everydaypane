import { json, unauthorized } from "@/server/http";
import { lookupStation } from "@/server/rivers";
import { adminFor } from "@/server/viewer";

/** Checks a Water Survey station number typed in the river levels widget's settings and returns its name. */
export async function GET(req: Request) {
  if (!(await adminFor(req))) return unauthorized();
  const id = (new URL(req.url).searchParams.get("id") ?? "").trim().toUpperCase();
  const station = await lookupStation(id);
  return json(station ? { station } : { station: null, error: "No real-time readings at that station number" });
}
