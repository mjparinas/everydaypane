import { describe, expect, it } from "vitest";

import { query } from "@/server/db";
import { useTestServer } from "@/test/server";

import { createAccount, setAccountPlan } from "./accounts";
import { saveAutomations } from "./adminAutomations";
import { clearFlagCache, setFlag } from "./featureFlags";
import { isUnsubscribed, runOnboarding, unsubscribe, unsubscribeUrl, validUnsubscribe } from "./onboarding";

const SIGNUP = Date.UTC(2026, 11, 1, 17); // 10 AM in Vancouver
const H = 3_600_000;

type Sent = { to: string[]; subject: string; html: string; headers?: Record<string, string> };

function fakeResend(ok = true) {
  const calls: { url: string; mails: Sent[] }[] = [];
  const send = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), mails: JSON.parse(String(init?.body)) as Sent[] });
    return new Response("{}", { status: ok ? 200 : 500 });
  }) as typeof fetch;
  return { calls, send };
}

describe("getting-started emails", () => {
  useTestServer({
    RESEND_API_KEY: "re_test",
    MAIL_POSTAL_ADDRESS: "1 Main St, Langley BC",
    NEXT_PUBLIC_SITE_URL: "https://www.everydaypane.com",
  });

  it("sends one a day to a new household's admin in one batch, never twice", async () => {
    clearFlagCache();
    await createAccount("Home", "new@example.com", SIGNUP);
    const r = fakeResend();
    expect(await runOnboarding(SIGNUP + H, r.send)).toEqual({ sent: 1 });
    expect(r.calls[0]!.url).toBe("https://api.resend.com/emails/batch");
    const mail = r.calls[0]!.mails[0]!;
    expect(mail.to).toEqual(["new@example.com"]);
    expect(mail.subject).toBe("Put Everydaypane on the wall");
    expect(mail.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");

    expect(await runOnboarding(SIGNUP + 2 * H, r.send)).toEqual({ sent: 0 });
    expect(await runOnboarding(SIGNUP + 24 * H, r.send)).toEqual({ sent: 1 });
    expect(r.calls[1]!.mails[0]!.subject).toBe("Your family's week, on one wall");
  });

  it("marks Household emails by plan", async () => {
    clearFlagCache();
    const acct = await createAccount("Home", "new@example.com", SIGNUP, { trial: false });
    const r = fakeResend();
    for (let d = 0; d < 4; d++) await runOnboarding(SIGNUP + H + d * 24 * H, r.send);
    expect(r.calls[3]!.mails[0]!.html).toContain("Household plan only.");
    await setAccountPlan(acct.id, "paid");
    await runOnboarding(SIGNUP + H + 5 * 24 * H, r.send); // layouts (Free)
    await runOnboarding(SIGNUP + H + 6 * 24 * H, r.send); // meals (Household)
    expect(r.calls[5]!.mails[0]!.html).toContain("included in your Household plan");
  });

  it("skips features switched off for everyone", async () => {
    await createAccount("Home", "new@example.com", SIGNUP);
    await setFlag("widget.agenda", false, SIGNUP);
    clearFlagCache();
    const r = fakeResend();
    await runOnboarding(SIGNUP + H, r.send);
    await runOnboarding(SIGNUP + 25 * H, r.send);
    expect(r.calls[1]!.mails[0]!.subject).toBe("Make the wall feel like home");
    expect(r.calls[1]!.mails[0]!.html).toContain("Getting started · 2 of 17");
  });

  it("hands the email back when Resend refuses, so the next run tries again", async () => {
    clearFlagCache();
    await createAccount("Home", "new@example.com", SIGNUP);
    expect(await runOnboarding(SIGNUP + H, fakeResend(false).send)).toEqual({ sent: 0 });
    expect(await query("SELECT * FROM onboarding_sends")).toHaveLength(0);
    expect(await runOnboarding(SIGNUP + 2 * H, fakeResend().send)).toEqual({ sent: 1 });
  });

  it("stops for an address that unsubscribed, and when staff pause it", async () => {
    clearFlagCache();
    await createAccount("Home", "new@example.com", SIGNUP);
    await unsubscribe("New@example.com");
    expect(await isUnsubscribed("new@example.com")).toBe(true);
    expect(await runOnboarding(SIGNUP + H, fakeResend().send)).toEqual({ sent: 0 });
    await createAccount("Home", "other@example.com", SIGNUP);
    await saveAutomations({ onboarding: false });
    expect(await runOnboarding(SIGNUP + H, fakeResend().send)).toEqual({ sent: 0, reason: "off" });
  });

  it("leaves households from before the series alone", async () => {
    clearFlagCache();
    await createAccount("Home", "old@example.com", Date.UTC(2026, 10, 20));
    expect(await runOnboarding(Date.UTC(2026, 10, 27, 18), fakeResend().send)).toEqual({ sent: 0 });
  });

  it("sends the trial-ending emails on day 10 and day 13, in place of that day's tip", async () => {
    clearFlagCache();
    await createAccount("Home", "new@example.com", SIGNUP);
    const r = fakeResend();
    const D = 24 * H;
    for (let d = 0; d < 10; d++) await runOnboarding(SIGNUP + H + d * D, r.send);
    expect(r.calls.at(-1)!.mails[0]!.html).toContain("Household trial");
    // Day 10 at 10 AM in Vancouver: four days left.
    expect(await runOnboarding(SIGNUP + 10 * D, r.send)).toEqual({ sent: 1 });
    expect(r.calls.at(-1)!.mails[0]!.subject).toBe("4 days left in your Household trial");
    // Still one email that day.
    expect(await runOnboarding(SIGNUP + 10 * D + 3 * H, r.send)).toEqual({ sent: 0 });
    expect(await runOnboarding(SIGNUP + 11 * D + H, r.send)).toEqual({ sent: 1 });
    expect(r.calls.at(-1)!.mails[0]!.subject).not.toContain("trial");
    expect(await runOnboarding(SIGNUP + 13 * D + H, r.send)).toEqual({ sent: 1 });
    expect(r.calls.at(-1)!.mails[0]!.subject).toBe("Your Household trial ends tomorrow");
  });

  it("signs unsubscribe links", () => {
    const url = new URL(unsubscribeUrl("new@example.com"));
    expect(validUnsubscribe("new@example.com", url.searchParams.get("t")!)).toBe(true);
    expect(validUnsubscribe("someone@example.com", url.searchParams.get("t")!)).toBe(false);
    expect(validUnsubscribe("new@example.com", "nope")).toBe(false);
  });
});
