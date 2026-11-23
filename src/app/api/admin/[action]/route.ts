import { acquisitionStats, deviceBreakdown, funnelStats, trafficStats } from "@/server/adminAnalytics";
import { listAudit } from "@/server/adminAudit";
import { audit, requireStaff, staffEnabled } from "@/server/adminAuth";
import { getAutomations, saveAutomations, sendTestAutomationEmail } from "@/server/adminAutomations";
import { createCode, listCodes, setCodeEnabled } from "@/server/adminCodes";
import { displayDetail, listDisplaysForStaff, setDisplayTest } from "@/server/adminDisplays";
import { clearFlag, listFlags, setFlag } from "@/server/adminFlags";
import { addHouseholdNote, grantPlan, householdDetail, searchHouseholds } from "@/server/adminHouseholds";
import { inboxSummary } from "@/server/adminInbox";
import { overviewStats } from "@/server/adminOverview";
import { createReport, listReports, updateReport } from "@/server/adminReports";
import { revenueSummary, saveRunningCosts, type RunningCost } from "@/server/adminRevenue";
import { systemHealth } from "@/server/adminSystem";
import { addTask, completeTask, derivedTodo, hideTodo, listManualTasks } from "@/server/adminTodo";
import { json, notFound, readJson } from "@/server/http";
import { listHouseholdsForStaff } from "@/server/staffAccounts";

type Ctx = { params: Promise<{ action: string }> };

function daysOf(req: Request) {
  const d = Number(new URL(req.url).searchParams.get("days") || "30");
  return [1, 7, 30, 90, 365].includes(d) ? d : 30;
}

export async function GET(req: Request, ctx: Ctx) {
  if (!staffEnabled()) return notFound();
  const gate = await requireStaff(req);
  if ("response" in gate) return gate.response;
  const { action } = await ctx.params;
  const url = new URL(req.url);

  switch (action) {
    case "overview":
      return json({ staff: gate.staff, ...(await overviewStats(daysOf(req))) });
    case "todo":
      return json({ items: await derivedTodo(), tasks: await listManualTasks() });
    case "reports": {
      const status = (url.searchParams.get("status") || "open") as "open" | "done" | "dismissed" | "all";
      return json({ reports: await listReports(status) });
    }
    case "traffic":
      return json(await trafficStats(daysOf(req)));
    case "acquisition":
      return json(await acquisitionStats(daysOf(req)));
    case "funnel":
      return json(await funnelStats(daysOf(req)));
    case "devices": {
      if (url.searchParams.get("id")) {
        const d = await displayDetail(url.searchParams.get("id")!);
        return d ? json({ display: d }) : notFound();
      }
      if (url.searchParams.get("breakdown") === "1") return json(await deviceBreakdown(daysOf(req)));
      return json({
        displays: await listDisplaysForStaff({
          q: url.searchParams.get("q") || undefined,
          tests: url.searchParams.get("tests") === "1",
          before: url.searchParams.get("before") ? Number(url.searchParams.get("before")) : undefined,
        }),
      });
    }
    case "revenue":
      return json(await revenueSummary());
    case "codes":
      return json({ codes: await listCodes() });
    case "households":
    case "accounts": {
      const id = url.searchParams.get("id") || url.searchParams.get("open");
      if (id) {
        const detail = await householdDetail(id);
        return detail ? json({ household: detail }) : notFound();
      }
      const q = url.searchParams.get("q") || "";
      const households = q ? await searchHouseholds(q) : await listHouseholdsForStaff();
      return json({
        staff: gate.staff,
        households: households.map((h) => ({
          id: h.id,
          name: h.name,
          plan: h.plan,
          createdAt: h.createdAt,
          deviceCount: h.deviceCount,
          members: h.members,
          hasStripe: Boolean(h.stripeCustomerId),
          stripeCustomerId: h.stripeCustomerId,
          stripeSubscriptionId: h.stripeSubscriptionId,
        })),
      });
    }
    case "flags":
      return json({ flags: await listFlags() });
    case "automations":
      return json({ automations: await getAutomations(), adminCount: [...(await import("@/server/env")).env.adminEmails()].length });
    case "system":
      return json(await systemHealth());
    case "log":
      return json({
        entries: await listAudit({
          before: url.searchParams.get("before") ? Number(url.searchParams.get("before")) : undefined,
          who: url.searchParams.get("who") || undefined,
          what: url.searchParams.get("what") || undefined,
        }),
      });
    case "inbox":
      return json(await inboxSummary());
    case "export": {
      if (gate.staff.role !== "admin") return notFound();
      const type = url.searchParams.get("type") || "households";
      const households = await listHouseholdsForStaff();
      const lines =
        type === "displays"
          ? [
              "id,name,account_id,created_at,last_seen_at,is_test",
              ...(await listDisplaysForStaff({ tests: true, limit: 500 })).map(
                (d) => `${csv(d.id)},${csv(d.name)},${csv(d.accountId)},${d.createdAt},${d.lastSeenAt ?? ""},${d.isTest ? 1 : 0}`,
              ),
            ]
          : [
              "id,name,plan,created_at,device_count,members,stripe",
              ...households.map(
                (h) =>
                  `${csv(h.id)},${csv(h.name)},${h.plan},${h.createdAt},${h.deviceCount},${csv(h.members.map((m) => m.email).join(";"))},${h.stripeCustomerId ? 1 : 0}`,
              ),
            ];
      await audit(gate.staff.email, "export", type);
      return new Response(lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="everydaypane-${type}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    default:
      return notFound();
  }
}

export async function POST(req: Request, ctx: Ctx) {
  if (!staffEnabled()) return notFound();
  const gate = await requireStaff(req, { write: true });
  if ("response" in gate) return gate.response;
  const { action } = await ctx.params;
  const body = (await readJson(req).catch(() => ({}))) as Record<string, unknown>;

  switch (action) {
    case "todo": {
      if (body.op === "add") {
        const id = await addTask(String(body.text || ""), gate.staff.email, body.dueAt == null ? null : Number(body.dueAt));
        await audit(gate.staff.email, "todo.add", id);
        return json({ ok: true, id });
      }
      if (body.op === "done") {
        await completeTask(String(body.id || ""));
        await audit(gate.staff.email, "todo.done", String(body.id || ""));
        return json({ ok: true });
      }
      if (body.op === "hide") {
        const until = body.until === "week" ? Date.now() + 7 * 86_400_000 : body.until === "tomorrow" ? Date.now() + 86_400_000 : null;
        await hideTodo(String(body.key || ""), until, Boolean(body.dismiss));
        await audit(gate.staff.email, "todo.hide", String(body.key || ""));
        return json({ ok: true });
      }
      return json({ error: "Unknown op" }, 400);
    }
    case "reports": {
      if (body.op === "create") {
        const id = await createReport({ text: String(body.text || ""), email: gate.staff.email });
        return json({ ok: true, id });
      }
      await updateReport(String(body.id || ""), String(body.status || "done"), body.note == null ? null : String(body.note));
      await audit(gate.staff.email, "reports.update", String(body.id || ""), { status: body.status });
      return json({ ok: true });
    }
    case "households": {
      if (body.op === "note") {
        const id = await addHouseholdNote(String(body.id || ""), gate.staff.email, String(body.text || ""));
        await audit(gate.staff.email, "household.note", String(body.id || ""));
        return json({ ok: true, id });
      }
      if (body.op === "plan") {
        const plan = body.plan === "paid" ? "paid" : "free";
        await grantPlan(String(body.id || ""), plan);
        await audit(gate.staff.email, "household.plan", String(body.id || ""), { plan });
        return json({ ok: true });
      }
      return json({ error: "Unknown op" }, 400);
    }
    case "devices": {
      await setDisplayTest(String(body.id || ""), Boolean(body.isTest));
      await audit(gate.staff.email, "display.test", String(body.id || ""), { isTest: body.isTest });
      return json({ ok: true });
    }
    case "codes": {
      if (body.op === "create") {
        const code = await createCode({
          code: body.code ? String(body.code) : undefined,
          kind: String(body.kind || "household"),
          maxUses: Number(body.maxUses) || 1,
          expiresAt: body.expiresAt == null ? null : Number(body.expiresAt),
          note: body.note == null ? null : String(body.note),
        });
        await audit(gate.staff.email, "codes.create", code);
        return json({ ok: true, code });
      }
      await setCodeEnabled(String(body.code || ""), Boolean(body.enabled));
      await audit(gate.staff.email, "codes.toggle", String(body.code || ""));
      return json({ ok: true });
    }
    case "flags": {
      if (body.op === "clear") {
        await clearFlag(String(body.name || ""));
        await audit(gate.staff.email, "flags.clear", String(body.name || ""));
        return json({ ok: true });
      }
      await setFlag(String(body.name || ""), Boolean(body.value), body.share == null ? 100 : Number(body.share));
      await audit(gate.staff.email, "flags.set", String(body.name || ""), { value: body.value, share: body.share });
      return json({ ok: true });
    }
    case "automations": {
      if (body.op === "test") {
        await sendTestAutomationEmail();
        await audit(gate.staff.email, "automations.test", null);
        return json({ ok: true });
      }
      const next = await saveAutomations(body as Parameters<typeof saveAutomations>[0]);
      await audit(gate.staff.email, "automations.save", null);
      return json({ ok: true, automations: next });
    }
    case "revenue": {
      const costs = await saveRunningCosts((body.costs as RunningCost[]) || []);
      await audit(gate.staff.email, "revenue.costs", null);
      return json({ ok: true, costs });
    }
    default:
      return notFound();
  }
}

function csv(v: string) {
  const s = String(v ?? "");
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}
