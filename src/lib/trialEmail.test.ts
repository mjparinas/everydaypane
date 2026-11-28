import { describe, expect, it } from "vitest";

import { dueTrialStep, trialMail, usageLines, type TrialUsage } from "./trialEmail";

const none: TrialUsage = { displays: 1, messages: 0, shopping: 0, meals: 0, chores: 0, photos: 0, widgets: [], features: [] };

describe("trial-ending emails", () => {
  it("leads with the household's own numbers, biggest first", () => {
    const lines = usageLines({
      ...none,
      messages: 3,
      shopping: 12,
      chores: 1,
      widgets: ["Chore chart", "Meals"],
      features: ["screen saver"],
    });
    expect(lines).toEqual([
      "12 items added to the shopping list",
      "3 notes posted to the message board",
      "1 chore ticked off on the wall",
      "2 Household widgets on your wall: Chore chart, Meals",
      "The screen saver running",
    ]);
    expect(usageLines(none)).toEqual([]);
  });

  it("suggests features when nothing was used, and names the end date", () => {
    const m = trialMail({
      step: "trial-10",
      endsOn: "December 15",
      daysLeft: 4,
      usage: none,
      siteUrl: "https://www.everydaypane.com",
      unsubscribeUrl: "https://www.everydaypane.com/api/email/unsubscribe/?e=a",
      postalAddress: "1 Main St",
    });
    expect(m.subject).toBe("4 days left in your Household trial");
    expect(m.text).toContain("chore chart");
    expect(m.text).toContain("On December 15 the wall goes back to Free");
    expect(m.html).toContain("/household/#upgrade");
  });

  it("says today or tomorrow on the last email", () => {
    const base = {
      endsOn: "December 15",
      usage: { ...none, messages: 2 },
      siteUrl: "https://x",
      unsubscribeUrl: "https://x/u",
      postalAddress: "1 Main St",
    };
    expect(trialMail({ ...base, step: "trial-13", daysLeft: 1 }).subject).toBe("Your Household trial ends tomorrow");
    expect(trialMail({ ...base, step: "trial-13", daysLeft: 0 }).subject).toBe("Your Household trial ends today");
  });

  it("picks day 10 or day 13, never both, inside sending hours", () => {
    expect(dueTrialStep(6, new Set(), 11)).toBeNull();
    expect(dueTrialStep(4, new Set(), 11)).toBe("trial-10");
    expect(dueTrialStep(4, new Set(), 8)).toBeNull();
    expect(dueTrialStep(3, new Set(["trial-10"]), 11)).toBeNull();
    expect(dueTrialStep(1, new Set(["trial-10"]), 11)).toBe("trial-13");
    expect(dueTrialStep(1, new Set(), 11)).toBe("trial-13");
    expect(dueTrialStep(0, new Set(["trial-13"]), 11)).toBeNull();
    expect(dueTrialStep(-1, new Set(), 11)).toBeNull();
  });
});
