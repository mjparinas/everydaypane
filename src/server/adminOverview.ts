import "server-only";

import { openReportCount } from "./adminReports";
import { revenueSummary } from "./adminRevenue";
import { derivedTodo, listManualTasks } from "./adminTodo";
import { query } from "./db";

export async function overviewStats(days: number) {
  const end = Date.now();
  const start = end - days * 86_400_000;
  const prevStart = start - days * 86_400_000;
  const countAccounts = async (from: number, to: number) =>
    Number(
      (await query<{ n: number }>("SELECT COUNT(*) AS n FROM accounts WHERE created_at >= ? AND created_at < ?", [from, to]))[0]?.n ?? 0,
    );
  const countDisplays = async (from: number, to: number) =>
    Number(
      (
        await query<{ n: number }>(
          "SELECT COUNT(*) AS n FROM devices WHERE created_at >= ? AND created_at < ? AND COALESCE(is_test,0) = 0",
          [from, to],
        )
      )[0]?.n ?? 0,
    );
  const signups = await countAccounts(start, end);
  const prevSignups = await countAccounts(prevStart, start);
  const displays = await countDisplays(start, end);
  const prevDisplays = await countDisplays(prevStart, start);
  const revenue = await revenueSummary();
  const todo = await derivedTodo();
  const tasks = await listManualTasks();
  const pct = (a: number, b: number) => (b === 0 ? null : ((a - b) / b) * 100);
  const daily = await query<{ day: string; n: number }>(
    `SELECT date(created_at/1000, 'unixepoch') AS day, COUNT(*) AS n
     FROM accounts WHERE created_at >= ? AND created_at < ?
     GROUP BY day ORDER BY day ASC`,
    [start, end],
  );
  return {
    signups,
    signupsDelta: pct(signups, prevSignups),
    displays,
    displaysDelta: pct(displays, prevDisplays),
    free: revenue.free,
    paid: revenue.paid,
    grossMrr: revenue.grossMrr,
    openReports: await openReportCount(),
    needsYou: [
      ...todo.slice(0, 5),
      ...tasks.slice(0, 3).map((t) => ({ key: t.id, kind: "people" as const, title: t.text, detail: "Manual task", href: "To Do" })),
    ],
    dailySignups: daily.map((d) => ({ day: d.day, n: Number(d.n) })),
  };
}
