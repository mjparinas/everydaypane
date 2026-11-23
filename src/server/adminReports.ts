import "server-only";

import { randomToken } from "./crypto";
import { query, run } from "./db";

export async function listReports(status: "open" | "done" | "dismissed" | "all" = "open") {
  const rows =
    status === "all"
      ? await query<{
          id: string;
          account_id: string | null;
          email: string | null;
          text: string;
          status: string;
          note: string | null;
          created_at: number;
          updated_at: number;
        }>("SELECT * FROM problem_reports ORDER BY created_at DESC LIMIT 200")
      : await query<{
          id: string;
          account_id: string | null;
          email: string | null;
          text: string;
          status: string;
          note: string | null;
          created_at: number;
          updated_at: number;
        }>("SELECT * FROM problem_reports WHERE status = ? ORDER BY created_at DESC LIMIT 200", [status]);
  return rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    email: r.email,
    text: r.text,
    status: r.status,
    note: r.note,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  }));
}

export async function createReport(opts: { accountId?: string; email?: string; text: string }, now = Date.now()) {
  const text = opts.text.trim().slice(0, 8000);
  if (!text) throw new Error("Empty report");
  const id = randomToken(12);
  await run(
    "INSERT INTO problem_reports (id, account_id, email, text, status, note, created_at, updated_at) VALUES (?, ?, ?, ?, 'open', NULL, ?, ?)",
    [id, opts.accountId ?? null, opts.email ?? null, text, now, now],
  );
  return id;
}

export async function updateReport(id: string, status: string, note: string | null, now = Date.now()) {
  if (!["open", "done", "dismissed"].includes(status)) throw new Error("Bad status");
  return (
    (await run("UPDATE problem_reports SET status = ?, note = ?, updated_at = ? WHERE id = ?", [
      status,
      note?.slice(0, 1000) ?? null,
      now,
      id,
    ])) === 1
  );
}

export async function openReportCount() {
  const rows = await query<{ n: number }>("SELECT COUNT(*) AS n FROM problem_reports WHERE status = 'open'");
  return Number(rows[0]?.n ?? 0);
}
