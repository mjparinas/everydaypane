import { z } from "zod";

import { backupFileName, makeBackup, readBackup } from "@/server/backup";
import { loadConfig, saveConfig } from "@/server/config";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { adminFor } from "@/server/viewer";

/** Downloads the settings document as a backup file. `?wifi=1` keeps WiFi passwords in it. */
export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const now = new Date();
  const wifiPasswords = new URL(req.url).searchParams.get("wifi") === "1";
  const backup = makeBackup(await loadConfig(accountId), { wifiPasswords }, now);
  return new Response(`${JSON.stringify(backup, null, 2)}\n`, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${backupFileName(now)}"`,
      "Cache-Control": "no-store",
    },
  });
}

const body = z.object({ baseVersion: z.number().int().min(0), backup: z.unknown(), dryRun: z.boolean().optional() });

/**
 * Restores a backup over the current settings. `dryRun` only checks the file and says what is in it, so the admin
 * panel can show that before anything changes. The save is versioned like any other (a stale one gets 409).
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const parsed = body.safeParse(await readJson(req, 2_000_000).catch(() => null));
  if (!parsed.success) return json({ error: "That file isn't a settings backup." }, 400);
  const current = await loadConfig(accountId);
  const read = readBackup(parsed.data.backup, current.config);
  if (!read.ok) return json(read, 422);
  if (parsed.data.dryRun) return json({ ok: true, summary: read.summary });
  const saved = await saveConfig(accountId, read.config, parsed.data.baseVersion);
  if (!saved.ok) return json(saved, saved.status);
  return json({ ok: true, version: saved.version, config: read.config, summary: read.summary });
}
