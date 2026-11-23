import "server-only";

import { BRAND } from "@/lib/brand";
import { emailHtml } from "@/lib/email";
import { SITE_URL } from "@/lib/site";

import { randomToken, sha256 } from "./crypto";
import { query, rateLimit, run } from "./db";
import { env } from "./env";
import { clientIp, json, notFound, sameOrigin } from "./http";
import { sendEmail } from "./mail";
import { passedSecondStep } from "./twoFactor";

/** Dedicated staff cookie — separate from household `ep_session` (Tuned/Liftsmith). */
export const ADMIN_COOKIE = "ep_admin";
const LINK_MS = 15 * 60_000;
export const ADMIN_IDLE_MS = 30 * 86_400_000;
export const ADMIN_MAX_MS = 90 * 86_400_000;
const RENEW_MS = 86_400_000;

export type StaffRole = "admin" | "support";

export interface Staff {
  email: string;
  role: StaffRole;
}

export interface StaffSession extends Staff {
  sessionHash: string;
  twoFactor: boolean;
  ready: boolean;
}

export function staffEnabled(): boolean {
  return env.adminEmails().size > 0 || env.supportEmails().size > 0;
}

export function roleOf(email: string): StaffRole | null {
  const e = email.trim().toLowerCase();
  if (env.adminEmails().has(e)) return "admin";
  if (env.supportEmails().has(e)) return "support";
  return null;
}

export const ADMIN_LINK_SUBJECT = `Your ${BRAND.name} admin sign-in link`;

function adminCookie(value: string, maxAge: number): string {
  return `${ADMIN_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function readAdminCookie(req: Request): string | undefined {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === ADMIN_COOKIE) return v.join("=");
  }
  return undefined;
}

export async function reportStaffFailure(email: string, kind: string, now = Date.now()): Promise<void> {
  await run("INSERT INTO staff_sign_in_failures (email, kind, at) VALUES (?, ?, ?)", [email, kind, now]);
}

export async function audit(admin: string, action: string, target: string | null, detail?: unknown): Promise<void> {
  await run("INSERT INTO admin_audit (at, admin, action, target, detail) VALUES (?, ?, ?, ?, ?)", [
    Date.now(),
    admin,
    action,
    target,
    detail === undefined ? null : JSON.stringify(detail).slice(0, 2000),
  ]);
}

function adminSignInMail(link: string): { subject: string; text: string; html: string } {
  return {
    subject: ADMIN_LINK_SUBJECT,
    text: `Sign in to the ${BRAND.name} admin panel:\n\n${link}\n\nThe link works once, for 15 minutes. If you didn't ask for it, ignore this email.\n\n— ${BRAND.name}\n${SITE_URL}`,
    html: emailHtml({
      preheader: "Your one-time admin sign-in link. It works for 15 minutes.",
      title: `Sign in to ${BRAND.name} admin`,
      bodyHtml: `<p style="margin:0 0 12px">Tap the button below to open the platform admin panel. The link works once, for 15 minutes.</p>`,
      cta: { href: link, label: "Open admin" },
      footnote: "If you didn't ask for this, you can ignore this email.",
    }),
  };
}

const SENT = {
  ok: true,
  message: "If that address is staff, a sign-in link is on its way. It works once, for 15 minutes.",
};

/** Starts staff sign-in. Always answers the same so the allow-list can't be probed. */
export async function startAdminSignIn(req: Request, email: string, now = Date.now()): Promise<Response> {
  if (!staffEnabled()) return notFound();
  const e = email.trim().toLowerCase();
  if (!(await rateLimit(`admin-login:${clientIp(req)}`, 10, 15 * 60_000, now))) {
    return json({ error: "Too many tries. Wait 15 minutes and try again." }, 429);
  }
  if (!roleOf(e)) return json(SENT);
  const token = randomToken();
  await run("INSERT INTO admin_links (token_hash, email, expires_at) VALUES (?, ?, ?)", [sha256(token), e, now + LINK_MS]);
  const origin = env.siteUrl() || new URL(req.url).origin;
  const link = `${origin}/api/admin/login/?token=${encodeURIComponent(token)}`;
  const sent = await sendEmail({ to: e, ...adminSignInMail(link) });
  if (!sent) {
    if (!env.isProduction()) return json({ ...SENT, devLink: link });
    return json({ error: "Couldn't send the email." }, 502);
  }
  if (!env.resendKey() && !env.isProduction()) return json({ ...SENT, devLink: link });
  return json(SENT);
}

/** Finishes staff sign-in from the emailed link. */
export async function finishAdminSignIn(req: Request, now = Date.now()): Promise<Response> {
  const t = new URL(req.url).searchParams.get("token") ?? "";
  const back = (q: string) => new Response(null, { status: 303, headers: { Location: `/admin/${q}`, "Cache-Control": "no-store" } });
  if (!t) return back("?link=expired");
  const rows = await query<{ email: string; expires_at: number; used_at: number | null }>(
    "SELECT email, expires_at, used_at FROM admin_links WHERE token_hash = ?",
    [sha256(t)],
  );
  const link = rows[0];
  if (!link || link.used_at != null || Number(link.expires_at) < now || !roleOf(String(link.email))) {
    if (link) await reportStaffFailure(String(link.email), "link", now);
    return back("?link=expired");
  }
  const used = await query("UPDATE admin_links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL RETURNING email", [now, sha256(t)]);
  if (!used.length) return back("?link=expired");
  const sessionToken = randomToken();
  await run("INSERT INTO admin_sessions (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)", [
    sha256(sessionToken),
    link.email,
    now,
    now + ADMIN_IDLE_MS,
  ]);
  await audit(String(link.email), "signin", null);
  const res = back("");
  res.headers.append("Set-Cookie", adminCookie(sessionToken, ADMIN_MAX_MS / 1000));
  return res;
}

export async function getStaffSession(req: Request, now = Date.now()): Promise<StaffSession | null> {
  const c = readAdminCookie(req);
  if (!c) return null;
  const rows = await query<{ email: string; created_at: number; expires_at: number; step_at: number | null; enabled_at: number | null }>(
    `SELECT s.email, s.created_at, s.expires_at, st.at AS step_at, t.enabled_at
     FROM admin_sessions s
     LEFT JOIN admin_session_steps st ON st.token_hash = s.token_hash
     LEFT JOIN admin_two_factor t ON t.email = s.email
     WHERE s.token_hash = ?`,
    [sha256(c)],
  );
  const s = rows[0];
  if (!s) return null;
  if (Number(s.expires_at) < now) return null;
  if (Number(s.created_at) + ADMIN_MAX_MS < now) return null;
  const role = roleOf(String(s.email));
  if (!role) return null;
  const renewed = Math.min(now + ADMIN_IDLE_MS, Number(s.created_at) + ADMIN_MAX_MS);
  if (renewed - Number(s.expires_at) > RENEW_MS) {
    await run("UPDATE admin_sessions SET expires_at = ? WHERE token_hash = ?", [renewed, sha256(c)]).catch(() => 0);
  }
  const twoFactor = s.enabled_at != null;
  return {
    email: String(s.email),
    role,
    sessionHash: sha256(c),
    twoFactor,
    ready: passedSecondStep(twoFactor, s.step_at == null ? null : Number(s.step_at)),
  };
}

export async function getStaff(req: Request, now = Date.now()): Promise<Staff | null> {
  const s = await getStaffSession(req, now);
  return s?.ready ? { email: s.email, role: s.role } : null;
}

/** Guards an admin route: 404 for anyone else. Writes need role admin. */
export async function requireStaff(req: Request, opts: { write?: boolean } = {}): Promise<{ staff: Staff } | { response: Response }> {
  if (!staffEnabled()) return { response: notFound() };
  if (req.method !== "GET" && !sameOrigin(req)) return { response: json({ error: "Bad origin" }, 403) };
  let staff: Staff | null;
  try {
    staff = await getStaff(req);
  } catch {
    return { response: json({ error: "The database didn't answer. Try again in a moment." }, 503) };
  }
  if (!staff || (opts.write && staff.role !== "admin")) return { response: notFound() };
  return { staff };
}

export async function signOutAdmin(req: Request): Promise<Response> {
  const c = readAdminCookie(req);
  if (c) {
    await run("DELETE FROM admin_sessions WHERE token_hash = ?", [sha256(c)]);
    await run("DELETE FROM admin_session_steps WHERE token_hash = ?", [sha256(c)]);
  }
  const res = json({ ok: true });
  res.headers.append("Set-Cookie", adminCookie("", 0));
  return res;
}
