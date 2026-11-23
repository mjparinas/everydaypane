import { startDeviceSignIn } from "@/server/deviceSignIn";
import { json, sameOrigin } from "@/server/http";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  return startDeviceSignIn(req, new URL(req.url).origin);
}
