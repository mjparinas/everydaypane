import { audit, getStaffSession, requireStaff, staffEnabled } from "@/server/adminAuth";
import { json, notFound, readJson, sameOrigin } from "@/server/http";
import {
  checkSecondFactor,
  confirmEnrolment,
  disableTwoFactor,
  markSessionPassed,
  regenerateBackupCodes,
  startEnrolment,
  twoFactorMode,
  twoFactorState,
} from "@/server/twoFactor";

export async function GET(req: Request) {
  if (!staffEnabled()) return notFound();
  const session = await getStaffSession(req);
  if (!session) return json({ state: "signin" as const });
  const tf = await twoFactorState(session.email);
  return json({
    state: session.ready ? ("ok" as const) : ("twofactor" as const),
    email: session.email,
    role: session.role,
    twoFactor: tf,
    mode: twoFactorMode(),
  });
}

export async function POST(req: Request) {
  if (!staffEnabled()) return notFound();
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  const session = await getStaffSession(req);
  if (!session) return notFound();
  const body = (await readJson(req).catch(() => null)) as {
    action?: string;
    code?: string;
    restart?: boolean;
    email?: string;
  } | null;
  const action = body?.action ?? "";

  if (action === "enrol") {
    const { secret, uri } = await startEnrolment(session.email, Boolean(body?.restart));
    return json({ secret, uri });
  }

  if (action === "confirm") {
    const code = typeof body?.code === "string" ? body.code : "";
    const result = await confirmEnrolment(session.email, code, session.sessionHash);
    if (result.result === "ok") await audit(session.email, "2fa.enable", null);
    return json(result);
  }

  if (action === "verify") {
    const code = typeof body?.code === "string" ? body.code : "";
    const result = await checkSecondFactor(session.email, code);
    if (result === "ok") {
      await markSessionPassed(session.sessionHash);
      await audit(session.email, "2fa.verify", null);
    }
    return json({ result });
  }

  if (action === "backup") {
    const gate = await requireStaff(req, { write: true });
    if ("response" in gate) return gate.response;
    const code = typeof body?.code === "string" ? body.code : "";
    const check = await checkSecondFactor(session.email, code);
    if (check !== "ok") return json({ result: check });
    const codes = await regenerateBackupCodes(session.email);
    await audit(session.email, "2fa.backup-codes", null);
    return json({ result: "ok", codes });
  }

  if (action === "disable") {
    const gate = await requireStaff(req, { write: true });
    if ("response" in gate) return gate.response;
    const target = typeof body?.email === "string" ? body.email.trim().toLowerCase() : session.email;
    const keep = target === session.email ? session.sessionHash : null;
    if (target === session.email) {
      const code = typeof body?.code === "string" ? body.code : "";
      const check = await checkSecondFactor(session.email, code);
      if (check !== "ok") return json({ result: check });
    }
    await disableTwoFactor(target, keep);
    await audit(session.email, "2fa.disable", target);
    return json({ result: "ok" });
  }

  return json({ error: "Unknown action" }, 400);
}
