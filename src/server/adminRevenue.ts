import "server-only";

import { getSetting, setSetting } from "./adminSettings";
import { query } from "./db";

/** Everydaypane Household monthly price (see marketingPlans). */
export const HOUSEHOLD_MRR_USD = 7;

export type RunningCost = { id: string; name: string; amount: number; period: "month" | "year" };

export async function revenueSummary() {
  const plans = await query<{ plan: string; n: number; stripe: number }>(
    `SELECT plan,
            COUNT(*) AS n,
            SUM(CASE WHEN stripe_customer_id IS NOT NULL AND stripe_customer_id != '' THEN 1 ELSE 0 END) AS stripe
     FROM accounts GROUP BY plan`,
  );
  let free = 0;
  let paid = 0;
  let stripeLinked = 0;
  for (const r of plans) {
    if (r.plan === "paid") {
      paid = Number(r.n);
      stripeLinked = Number(r.stripe);
    } else free += Number(r.n);
  }
  const costs = await getSetting<RunningCost[]>("running_costs", []);
  const costsMonth = costs.reduce((s, c) => s + (c.period === "year" ? c.amount / 12 : c.amount), 0);
  const grossMrr = paid * HOUSEHOLD_MRR_USD;
  const netMrr = grossMrr * (1 - 0.029) - paid * 0.3; // Stripe-ish estimate
  return {
    free,
    paid,
    stripeLinked,
    grossMrr,
    netMrr: Math.max(0, Math.round(netMrr * 100) / 100),
    costs,
    costsMonth: Math.round(costsMonth * 100) / 100,
    profitMonth: Math.round((netMrr - costsMonth) * 100) / 100,
  };
}

export async function saveRunningCosts(costs: RunningCost[]) {
  const clean = costs
    .filter((c) => c.name.trim() && c.amount >= 0)
    .map((c) => ({
      id: c.id || `cost_${Math.random().toString(36).slice(2, 8)}`,
      name: c.name.trim().slice(0, 80),
      amount: Number(c.amount) || 0,
      period: c.period === "year" ? ("year" as const) : ("month" as const),
    }));
  await setSetting("running_costs", clean);
  return clean;
}
