import { describe, expect, it } from "vitest";

import { ONBOARDING } from "./onboarding";
import { onboardingMail } from "./onboardingEmail";

const step = (id: string) => ONBOARDING.find((s) => s.id === id)!;
const base = {
  n: 4,
  total: 18,
  siteUrl: "https://www.everydaypane.com",
  unsubscribeUrl: "https://www.everydaypane.com/api/email/unsubscribe/?e=a%40b.c&t=x",
  postalAddress: "1 Main St, Langley BC",
};

describe("getting-started email", () => {
  it("is branded, with the kicker, the picture, the points and the footer", () => {
    const m = onboardingMail({ ...base, step: step("calendars"), plan: "free" });
    expect(m.subject).toBe(step("calendars").subject);
    expect(m.html).toContain("#3b5bdb");
    expect(m.html).toContain("Getting started · 4 of 18");
    expect(m.html).toContain('src="https://www.everydaypane.com/email/onboarding/calendars.jpg"');
    expect(m.html).toContain('width="504" height="315"');
    expect(m.html).toContain("Unsubscribe from these tips");
    expect(m.html).toContain("1 Main St, Langley BC");
    expect(m.text).toContain("• Google Calendar and Microsoft 365");
    expect(m.html).not.toContain("Household plan only");
  });

  it("sells Household to a Free household, with the price and the upgrade link", () => {
    const m = onboardingMail({ ...base, step: step("chores"), plan: "free" });
    expect(m.html).toContain("Household plan only.");
    expect(m.html).toContain("$7 a month or $59 a year");
    expect(m.html).toContain('href="https://www.everydaypane.com/household/#upgrade"');
    expect(m.text).toContain("See what Household adds: https://www.everydaypane.com/household/#upgrade");
  });

  it("tells a paying household it's included and links to the setting", () => {
    const m = onboardingMail({ ...base, step: step("chores"), plan: "paid" });
    expect(m.html).toContain("included in your Household plan");
    expect(m.html).not.toContain("#upgrade");
    expect(m.html).toContain("/household/#settings/chores");
  });

  it("keeps the HTML light", () => {
    for (const s of ONBOARDING) expect(onboardingMail({ ...base, step: s, plan: "free" }).html.length).toBeLessThan(16_000);
  });
});
