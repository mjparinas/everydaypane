import "server-only";

import { z } from "zod";

import type { DashboardConfig } from "@/lib/config/schema";
import type { YnabData } from "@/lib/display/types";

import { cached, forget } from "./cache";
import { env } from "./env";
import { getSecret, setSecret } from "./secrets";

// YNAB (Phase 5): OAuth or a personal access token in secrets; YNAB_PERSONAL_TOKEN as server fallback only.

const API = "https://api.ynab.com/v1";
const TTL = 2 * 60_000;

export class YnabDisconnected extends Error {
  constructor() {
    super("Connect YNAB under Settings");
  }
}

async function token(accountId: string): Promise<string> {
  const stored = await getSecret(accountId, "ynab.token");
  if (stored) return stored;
  const envTok = env.ynabPersonalToken();
  if (envTok) return envTok;
  throw new YnabDisconnected();
}

async function api(accountId: string, path: string): Promise<unknown> {
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${await token(accountId)}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (r.status === 401) throw new YnabDisconnected();
  if (!r.ok) throw new Error(`YNAB answered ${r.status}`);
  return r.json();
}

const budgetsSchema = z.object({
  data: z.object({ budgets: z.array(z.object({ id: z.string(), name: z.string() })).default([]) }),
});

const summarySchema = z.object({
  data: z.object({
    budget: z.object({
      name: z.string(),
      accounts: z.array(z.object({ name: z.string(), balance: z.number(), on_budget: z.boolean() })).default([]),
      categories: z.array(z.object({ name: z.string(), balance: z.number(), hidden: z.boolean().optional() })).default([]),
    }),
  }),
});

export async function saveYnabToken(accountId: string, tok: string, now = Date.now()): Promise<void> {
  await setSecret(accountId, "ynab.token", tok, now);
  await forget("ynab:");
}

export async function listYnabBudgets(accountId: string): Promise<{ id: string; name: string }[]> {
  const raw = await api(accountId, "/budgets");
  return budgetsSchema.parse(raw).data.budgets.map((b) => ({ id: b.id, name: b.name }));
}

export async function ynabFeed(accountId: string, config: DashboardConfig): Promise<YnabData> {
  const budgetId = config.integrations.ynab.budgetId;
  const key = `ynab:${accountId}:${budgetId}`;
  const { value, fetchedAt, stale } = await cached(key, TTL, async () => {
    let id = budgetId;
    if (!id) {
      const list = await listYnabBudgets(accountId);
      id = list[0]?.id ?? "";
    }
    if (!id) throw new YnabDisconnected();
    const raw = await api(accountId, `/budgets/${id}`);
    const p = summarySchema.parse(raw);
    const budget = p.data.budget;
    const accounts = budget.accounts
      .filter((a) => a.on_budget)
      .slice(0, 12)
      .map((a) => ({ name: a.name.slice(0, 40), balance: a.balance / 1000 }));
    const categories = budget.categories
      .filter((c) => !c.hidden)
      .slice(0, 12)
      .map((c) => ({ name: c.name.slice(0, 40), balance: c.balance / 1000 }));
    return { budgetName: budget.name.slice(0, 60), accounts, categories };
  });
  const v = value as { budgetName: string; accounts: YnabData["accounts"]; categories: YnabData["categories"] };
  return { updatedAt: fetchedAt, stale, connected: true, ...v };
}

export const ynabOAuthConfigured = () => Boolean(env.ynabClientId() && env.ynabClientSecret());
