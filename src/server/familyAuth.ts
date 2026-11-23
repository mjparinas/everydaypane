import "server-only";

import { requestSession, type Session } from "./auth";
import { deviceForToken, type Device } from "./devices";

/**
 * Who may edit the family's meals, shopping list and message board from a phone: a signed-in admin or family
 * session, or anyone who opened `/d/<token>/edit/` (the display's secret address). Display-token editors never get
 * admin powers (no pinning) and are keyed as `display:<deviceId>` so their notes stay deletable from that kitchen.
 * Melvin, 2026-11-22: QR on the wall, no magic link.
 */
export type FamilyEditor = { kind: "session"; session: Session } | { kind: "display"; device: Device };

export async function familyEditorFor(req: Request): Promise<FamilyEditor | null> {
  const session = await requestSession(req);
  if (session) return { kind: "session", session };
  const token = req.headers.get("x-display-token");
  if (!token) return null;
  const device = await deviceForToken(token);
  return device ? { kind: "display", device } : null;
}

/** Rate-limit and `postedBy` / meal `by` key for this editor. */
export function familyEditorKey(editor: FamilyEditor): string {
  return editor.kind === "session" ? editor.session.email : `display:${editor.device.id}`;
}

export function familyEditorIsAdmin(editor: FamilyEditor): boolean {
  return editor.kind === "session" && editor.session.role === "admin";
}

export function familyEditorAccountId(editor: FamilyEditor): string {
  return editor.kind === "session" ? editor.session.accountId : editor.device.accountId;
}
