import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { configVersion } from "@/server/config";
import { json } from "@/server/http";

export async function GET() {
  try {
    await configVersion(LEGACY_ACCOUNT_ID);
    return json({ ok: true, commit: process.env.NEXT_PUBLIC_COMMIT_SHA?.slice(0, 7) ?? "" });
  } catch {
    return json({ ok: false }, 503);
  }
}
