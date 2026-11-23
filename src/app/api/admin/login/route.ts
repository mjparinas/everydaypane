import { finishAdminSignIn, staffEnabled, startAdminSignIn } from "@/server/adminAuth";
import { json, notFound, readJson, sameOrigin } from "@/server/http";

export async function GET(req: Request) {
  if (!staffEnabled()) return notFound();
  return finishAdminSignIn(req);
}

export async function POST(req: Request) {
  if (!staffEnabled()) return notFound();
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  const body = (await readJson(req).catch(() => null)) as { email?: string } | null;
  const email = typeof body?.email === "string" ? body.email : "";
  if (!email.includes("@")) return json({ error: "Enter an email address." }, 400);
  return startAdminSignIn(req, email);
}
