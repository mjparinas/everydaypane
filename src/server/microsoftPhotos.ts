import "server-only";

import { accessToken, FILES_SCOPE, TODO_SCOPE } from "./microsoft";
import { getSecret } from "./secrets";

export async function filesGranted(accountId: string): Promise<boolean> {
  const scopes = (await getSecret(accountId, "microsoft.scopes"))?.split(" ") ?? [];
  return scopes.includes(FILES_SCOPE) || scopes.includes("Files.Read.All");
}

export async function todoGranted(accountId: string): Promise<boolean> {
  const scopes = (await getSecret(accountId, "microsoft.scopes"))?.split(" ") ?? [];
  return scopes.includes(TODO_SCOPE);
}

export async function graphGet(accountId: string, path: string): Promise<unknown> {
  const token = await accessToken(accountId);
  const r = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "Everydaypane/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) throw new Error(`Microsoft Graph answered ${r.status}`);
  return r.json() as Promise<unknown>;
}
