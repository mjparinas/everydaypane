import "server-only";

import { query, run } from "./db";

// Message pop-ups remembered per screen on the server (Melvin, 2026-11-26: "the messages, should be durable. if i
// refresh the page they should not go away. but also, different screens should have control of their own state"). A
// wall browser may throw its localStorage away on a reload (kiosk apps and some TVs do), which used to reset the
// screen's starting point and bury every note that was up. Each display device now keeps, in the database, the
// newest note it saw when the mode first ran (`since`) and the notes someone dismissed on it; nothing is shared
// between devices.

export interface PopupState {
  since: number;
  dismissed: string[];
}

/** Dismissals older than this are dropped: the note has long left the board's 20 newest by then. */
const KEEP_MS = 30 * 86_400_000;

/**
 * This display's pop-up state. The first read for a display fixes `since` at the newest note on the board, so
 * turning the mode on (or a new screen) pops nothing already there.
 */
export async function popupState(accountId: string, deviceId: string, board: { createdAt: number }[]): Promise<PopupState> {
  const newest = board.reduce((n, m) => Math.max(n, m.createdAt), 0);
  await run("INSERT OR IGNORE INTO display_popups (account_id, device_id, since) VALUES (?, ?, ?)", [accountId, deviceId, newest]);
  const row = (
    await query<{ since: number }>("SELECT since FROM display_popups WHERE account_id = ? AND device_id = ?", [accountId, deviceId])
  )[0];
  const dismissed = await query<{ message_id: string }>(
    "SELECT message_id FROM display_popup_dismissed WHERE account_id = ? AND device_id = ? ORDER BY at",
    [accountId, deviceId],
  );
  return { since: Number(row?.since ?? newest), dismissed: dismissed.map((d) => d.message_id) };
}

/** Records a dismissal on one display only. */
export async function dismissPopup(accountId: string, deviceId: string, messageId: string, now = Date.now()): Promise<void> {
  await run("INSERT OR IGNORE INTO display_popup_dismissed (account_id, device_id, message_id, at) VALUES (?, ?, ?, ?)", [
    accountId,
    deviceId,
    messageId,
    now,
  ]);
  await run("DELETE FROM display_popup_dismissed WHERE account_id = ? AND device_id = ? AND at < ?", [accountId, deviceId, now - KEEP_MS]);
}

/** Forgets every display's place when the mode is switched off, so switching it back on pops nothing old. */
export async function resetPopups(accountId: string): Promise<void> {
  await run("DELETE FROM display_popups WHERE account_id = ?", [accountId]);
  await run("DELETE FROM display_popup_dismissed WHERE account_id = ?", [accountId]);
}
