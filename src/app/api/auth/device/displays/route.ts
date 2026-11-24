import { requestSession } from "@/server/auth";
import { listUnlockDisplays } from "@/server/deviceSignIn";
import { unauthorized } from "@/server/http";

/** Household displays (names only) for the phone or wall unlock picker. */
export async function GET(req: Request) {
  const session = await requestSession(req);
  if (!session) return unauthorized();
  return listUnlockDisplays(session);
}
