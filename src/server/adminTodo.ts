import "server-only";

import { stripeEnabled } from "./billing";
import { randomToken } from "./crypto";
import { query, run } from "./db";
import { env } from "./env";

export type TodoItem = {
  key: string;
  kind: "urgent" | "people" | "money" | "setup";
  title: string;
  detail: string;
  href?: string;
};

export async function derivedTodo(): Promise<TodoItem[]> {
  const hidden = await query<{ key: string; until_at: number | null; dismissed: number }>(
    "SELECT key, until_at, dismissed FROM admin_todo_hidden",
  );
  const now = Date.now();
  const skip = new Set(hidden.filter((h) => h.dismissed || (h.until_at != null && Number(h.until_at) > now)).map((h) => h.key));

  const items: TodoItem[] = [];
  const openReports = await query<{ n: number }>("SELECT COUNT(*) AS n FROM problem_reports WHERE status = 'open'");
  const nReports = Number(openReports[0]?.n ?? 0);
  if (nReports > 0) {
    items.push({
      key: `reports:${nReports}`,
      kind: "people",
      title: `${nReports} problem report${nReports === 1 ? "" : "s"} to read`,
      detail: "Households sent a report from Settings.",
      href: "Reports",
    });
  }

  const missing: string[] = [];
  if (!env.sessionSecret() || env.sessionSecret().length < 32) missing.push("SESSION_SECRET");
  if (!env.resendKey()) missing.push("RESEND_API_KEY");
  if (!env.siteUrl()) missing.push("NEXT_PUBLIC_SITE_URL");
  if (!env.databaseUrl() && env.isProduction()) missing.push("DATABASE_URL");
  if (!stripeEnabled()) missing.push("STRIPE_SECRET_KEY / STRIPE_PRICE_ID");
  if (!env.analyticsSecret()) missing.push("ANALYTICS_SECRET");
  if (missing.length) {
    items.push({
      key: `env:${missing.join(",")}`,
      kind: "setup",
      title: "Required Settings Missing",
      detail: missing.join(", "),
      href: "System",
    });
  }

  return items.filter((i) => !skip.has(i.key));
}

export async function listManualTasks() {
  const rows = await query<{
    id: string;
    text: string;
    due_at: number | null;
    done_at: number | null;
    created_at: number;
    created_by: string;
  }>(
    "SELECT id, text, due_at, done_at, created_at, created_by FROM admin_tasks WHERE done_at IS NULL ORDER BY due_at IS NULL, due_at ASC, created_at DESC",
  );
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    dueAt: r.due_at == null ? null : Number(r.due_at),
    doneAt: r.done_at == null ? null : Number(r.done_at),
    createdAt: Number(r.created_at),
    createdBy: r.created_by,
  }));
}

export async function addTask(text: string, createdBy: string, dueAt: number | null, now = Date.now()) {
  const id = randomToken(10);
  await run("INSERT INTO admin_tasks (id, text, due_at, done_at, created_at, created_by) VALUES (?, ?, ?, NULL, ?, ?)", [
    id,
    text.trim().slice(0, 500),
    dueAt,
    now,
    createdBy,
  ]);
  return id;
}

export async function completeTask(id: string, now = Date.now()) {
  return (await run("UPDATE admin_tasks SET done_at = ? WHERE id = ? AND done_at IS NULL", [now, id])) === 1;
}

export async function hideTodo(key: string, untilAt: number | null, dismiss: boolean) {
  await run(
    `INSERT INTO admin_todo_hidden (key, until_at, dismissed) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET until_at = excluded.until_at, dismissed = excluded.dismissed`,
    [key, untilAt, dismiss ? 1 : 0],
  );
}
