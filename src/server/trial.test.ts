import { describe, expect, it } from "vitest";

import { GET as stateGET } from "@/app/api/display/state/route";
import { GET as billingGET, POST as billingPOST } from "@/app/api/household/billing/route";
import { defaultConfig } from "@/lib/config/defaults";
import { isFreeWidgetType, TRIAL_MS } from "@/lib/plans";
import { issueTestSession, testSessionCookie } from "@/server/auth";
import { req, useTestServer } from "@/test/server";

import { accountById, createAccount, endTrial, startTrial } from "./accounts";
import { grantPlan } from "./adminHouseholds";
import { saveConfig } from "./config";
import { addDevice } from "./devices";
import { gateConfig } from "./planGates";

async function cookieForMember(email: string): Promise<string> {
  const session = await issueTestSession(email);
  if (!session) throw new Error("Sign-in failed");
  return testSessionCookie(session).split(";")[0] ?? "";
}

describe("Household trial (Melvin, 2026-11-28)", () => {
  useTestServer();

  it("gives every new household 14 days of Household, then Free", async () => {
    const now = Date.UTC(2026, 11, 1);
    const account = await createAccount("Trial home", "trial@example.com", now);
    expect(account.trialEndsAt).toBe(now + TRIAL_MS);
    expect(account.paidPlan).toBe("free");
    // accountById reads the clock, so an account made "now" is mid-trial.
    const fresh = await createAccount("Today home", "today@example.com");
    expect((await accountById(fresh.id))?.plan).toBe("paid");
    const old = await createAccount("Old home", "old@example.com", Date.now() - TRIAL_MS - 1000);
    expect((await accountById(old.id))?.plan).toBe("free");
  });

  it("starts a trial once from Try Household and never twice", async () => {
    const account = await createAccount("No trial", "notrial@example.com", undefined, { trial: false });
    const cookie = await cookieForMember("notrial@example.com");
    const before = (await (await billingGET(req("/api/household/billing/", { headers: { cookie } }))).json()) as Record<string, unknown>;
    expect(before).toMatchObject({ plan: "free", trialAvailable: true, trialDaysLeft: 0 });
    const r = await billingPOST(req("/api/household/billing/?action=trial", { method: "POST", headers: { cookie } }));
    expect(r.status).toBe(200);
    const after = (await (await billingGET(req("/api/household/billing/", { headers: { cookie } }))).json()) as Record<string, unknown>;
    expect(after).toMatchObject({ plan: "paid", paidPlan: "free", trialAvailable: false, trialDaysLeft: 14 });
    const again = await billingPOST(req("/api/household/billing/?action=trial", { method: "POST", headers: { cookie } }));
    expect(again.status).toBe(409);
    expect(await startTrial(account.id)).toBe(false);
  });

  it("ends the trial when staff move a household to Free", async () => {
    const account = await createAccount("Staff home", "staffed@example.com");
    await grantPlan(account.id, "free");
    expect((await accountById(account.id))?.plan).toBe("free");
    expect(await startTrial(account.id)).toBe(false);
  });

  it("lets a trial household save Household settings, and pauses them on the wall once it ends", async () => {
    const account = await createAccount("Wall home", "wall@example.com");
    const config = defaultConfig();
    expect(gateConfig((await accountById(account.id))!.plan, config)).toEqual({ ok: true });
    const saved = await saveConfig(account.id, config, 0);
    expect(saved.ok).toBe(true);
    const { token } = await addDevice(account.id, "Kitchen", null);
    const state = async () =>
      (await (await stateGET(req("/api/display/state/", { headers: { "x-display-token": token } }))).json()) as {
        views: { widgets: { type: string; title?: string }[] }[];
        schedule: { enabled: boolean };
      };

    const during = await state();
    expect(during.schedule.enabled).toBe(true);
    expect(during.views.flatMap((v) => v.widgets).some((w) => !isFreeWidgetType(w.type))).toBe(true);

    await endTrial(account.id);
    const after = await state();
    expect(after.schedule.enabled).toBe(false);
    expect(after.views).toHaveLength(1);
    const types = after.views[0]!.widgets.map((w) => w.type);
    expect(types.every((t) => isFreeWidgetType(t))).toBe(true);
    expect(after.views[0]!.widgets.some((w) => w.type === "note" && w.title !== undefined)).toBe(true);
  });
});
