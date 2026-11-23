import "server-only";

import { randomToken } from "./crypto";
import { query, run } from "./db";

// The family message board (Melvin, 2026-11-17): short notes anyone on ADMIN_EMAILS or FAMILY_EMAILS posts from their
// phone ("Soccer moved to 5", "Dinner at Lola's"), shown on the displays' message board widget. A note can expire on
// its own, and admins can pin one to the top. The author's name is what they type, not their email, because the
// screen hangs in the kitchen for anyone to read.

export const MESSAGE_COLOURS = ["yellow", "pink", "blue", "green", "purple"] as const;
export type MessageColour = (typeof MESSAGE_COLOURS)[number];

export interface Message {
  id: string;
  author: string;
  text: string;
  colour: MessageColour;
  pinned: boolean;
  createdAt: number;
  expiresAt: number | null;
  /** Who posted it (kept so they can delete their own). Never sent to a display. */
  postedBy: string;
}

export type DisplayMessage = Omit<Message, "postedBy" | "expiresAt">;

type Row = {
  id: string;
  author: string;
  text: string;
  colour: string;
  pinned: number;
  created_at: number;
  expires_at: number | null;
  posted_by: string | null;
};

const toMessage = (r: Row): Message => ({
  id: r.id,
  author: r.author,
  text: r.text,
  colour: (MESSAGE_COLOURS as readonly string[]).includes(r.colour) ? (r.colour as MessageColour) : "yellow",
  pinned: Number(r.pinned) === 1,
  createdAt: Number(r.created_at),
  expiresAt: r.expires_at === null ? null : Number(r.expires_at),
  postedBy: r.posted_by ?? "",
});

export const MAX_MESSAGES = 200;

/** Notes that haven't expired: pinned ones first, then newest first. */
export async function listMessages(limit = 50, now = Date.now()): Promise<Message[]> {
  const rows = await query<Row>(
    "SELECT * FROM messages WHERE expires_at IS NULL OR expires_at > ? ORDER BY pinned DESC, created_at DESC LIMIT ?",
    [now, Math.min(Math.max(1, limit), MAX_MESSAGES)],
  );
  return rows.map(toMessage);
}

export async function postMessage(
  input: { author: string; text: string; colour: MessageColour; expiresInHours: number | null; postedBy: string },
  now = Date.now(),
): Promise<Message> {
  const id = randomToken(9);
  const expiresAt = input.expiresInHours ? now + input.expiresInHours * 3_600_000 : null;
  await run("INSERT INTO messages (id, author, text, colour, pinned, created_at, expires_at, posted_by) VALUES (?, ?, ?, ?, 0, ?, ?, ?)", [
    id,
    input.author,
    input.text,
    input.colour,
    now,
    expiresAt,
    input.postedBy,
  ]);
  // Expired notes are cleared out as new ones arrive, so the table stays small without a cron job.
  await run("DELETE FROM messages WHERE expires_at IS NOT NULL AND expires_at <= ?", [now]);
  return {
    id,
    author: input.author,
    text: input.text,
    colour: input.colour,
    pinned: false,
    createdAt: now,
    expiresAt,
    postedBy: input.postedBy,
  };
}

/** Deletes a note: its author may, and so may an admin. */
export async function removeMessage(id: string, by: { email: string; admin: boolean }): Promise<"ok" | "not-found" | "forbidden"> {
  const rows = await query<Row>("SELECT * FROM messages WHERE id = ?", [id]);
  const row = rows[0];
  if (!row) return "not-found";
  // A note from before authors were recorded (posted_by null) can be deleted by anyone in the family.
  if (!by.admin && row.posted_by !== null && row.posted_by !== by.email) return "forbidden";
  await run("DELETE FROM messages WHERE id = ?", [id]);
  return "ok";
}

export async function pinMessage(id: string, pinned: boolean): Promise<boolean> {
  return (await run("UPDATE messages SET pinned = ? WHERE id = ?", [pinned ? 1 : 0, id])) === 1;
}

/** What a display shows: no emails, no expiry times. */
export const forDisplay = (m: Message): DisplayMessage => ({
  id: m.id,
  author: m.author,
  text: m.text,
  colour: m.colour,
  pinned: m.pinned,
  createdAt: m.createdAt,
});

/** A tag that changes whenever the board does, so displays can poll with If-None-Match. */
export function boardTag(messages: { id: string; pinned: boolean }[]): string {
  return `"m-${messages.map((m) => `${m.id}${m.pinned ? "p" : ""}`).join(".")}"`.slice(0, 1000);
}
