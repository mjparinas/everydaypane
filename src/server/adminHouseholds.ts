import "server-only";

import type { PlanId } from "@/lib/plans";

import { accountById, endTrial, setAccountPlan } from "./accounts";
import { randomToken } from "./crypto";
import { query, run } from "./db";
import { listHouseholdsForStaff } from "./staffAccounts";

export async function searchHouseholds(q: string) {
  const all = await listHouseholdsForStaff();
  const needle = q.trim().toLowerCase();
  if (!needle) return all;
  return all.filter(
    (h) => h.id.toLowerCase().includes(needle) || h.name.toLowerCase().includes(needle) || h.members.some((m) => m.email.includes(needle)),
  );
}

export async function householdDetail(id: string) {
  const account = await accountById(id);
  if (!account) return null;
  const members = await query<{ email: string; role: string; created_at: number }>(
    "SELECT email, role, created_at FROM account_members WHERE account_id = ? ORDER BY role ASC, email ASC",
    [id],
  );
  const devices = await query<{
    id: string;
    name: string;
    created_at: number;
    last_seen_at: number | null;
    is_test: number;
    view_id: string | null;
  }>("SELECT id, name, created_at, last_seen_at, is_test, view_id FROM devices WHERE account_id = ? ORDER BY created_at", [id]);
  const notes = await query<{ id: string; admin: string; text: string; created_at: number }>(
    "SELECT id, admin, text, created_at FROM account_notes WHERE account_id = ? ORDER BY created_at DESC LIMIT 50",
    [id],
  );
  const config = await query<{ version: number; updated_at: number }>(
    "SELECT version, updated_at FROM account_config WHERE account_id = ?",
    [id],
  );
  return {
    ...account,
    members: members.map((m) => ({ email: m.email, role: m.role, createdAt: Number(m.created_at) })),
    devices: devices.map((d) => ({
      id: d.id,
      name: d.name,
      createdAt: Number(d.created_at),
      lastSeenAt: d.last_seen_at == null ? null : Number(d.last_seen_at),
      isTest: Boolean(d.is_test),
      viewId: d.view_id,
    })),
    notes: notes.map((n) => ({ id: n.id, admin: n.admin, text: n.text, createdAt: Number(n.created_at) })),
    configVersion: config[0] ? Number(config[0].version) : null,
    configUpdatedAt: config[0] ? Number(config[0].updated_at) : null,
  };
}

export async function addHouseholdNote(accountId: string, admin: string, text: string, now = Date.now()) {
  const trimmed = text.trim().slice(0, 1000);
  if (!trimmed) throw new Error("Note is empty");
  if (!(await accountById(accountId))) throw new Error("Household not found");
  const id = randomToken(12);
  await run("INSERT INTO account_notes (id, account_id, admin, text, created_at) VALUES (?, ?, ?, ?, ?)", [
    id,
    accountId,
    admin,
    trimmed,
    now,
  ]);
  return id;
}

export async function grantPlan(accountId: string, plan: PlanId) {
  if (!(await accountById(accountId))) throw new Error("Household not found");
  await setAccountPlan(accountId, plan);
  // "Move to Free" means Free now, so a running Household trial ends with it.
  if (plan === "free") await endTrial(accountId);
}
