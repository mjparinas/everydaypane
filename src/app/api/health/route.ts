import { configVersion } from "@/server/config";
import { json } from "@/server/http";

export async function GET() {
  try {
    await configVersion();
    return json({ ok: true, commit: process.env.NEXT_PUBLIC_COMMIT_SHA?.slice(0, 7) ?? "" });
  } catch {
    return json({ ok: false }, 503);
  }
}
