import { gmailGranted } from "@/server/gmail";
import { unauthorized } from "@/server/http";
import { getSecret } from "@/server/secrets";
import { adminFor } from "@/server/viewer";

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  return Response.json({
    ynab: Boolean(await getSecret(accountId, "ynab.token")),
    trello: Boolean(await getSecret(accountId, "trello.token")),
    fitbit: Boolean(await getSecret(accountId, "fitbit.refreshToken")),
    slack: Boolean(await getSecret(accountId, "slack.token")),
    gmail: await gmailGranted(accountId),
  });
}
