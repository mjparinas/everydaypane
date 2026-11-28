import { BRAND } from "./brand";
import { EMAIL, emailHtml, escapeHtml } from "./email";
import { MARKETING_PLANS } from "./marketingPlans";

// The two trial-ending emails (Melvin, 2026-11-28: "can do you all 5", the coordinator's item 2: emails at day 10 and
// day 13 "that show what they've used"). They sit beside the getting-started series (src/lib/onboarding.ts), go out
// from the same hourly job and the same chrome, and lead with the household's own numbers, because "your family posted
// 14 notes" sells better than a feature list. A household that used nothing gets three things worth trying instead.

export type TrialStep = "trial-10" | "trial-13";
export const TRIAL_STEPS: readonly TrialStep[] = ["trial-10", "trial-13"];

export interface TrialUsage {
  displays: number;
  messages: number;
  shopping: number;
  meals: number;
  chores: number;
  photos: number;
  /** Names of Household widgets on the household's views, as the picker names them. */
  widgets: string[];
  /** Household switches in use: "time-of-day schedule", "screen saver", "message pop-ups". */
  features: string[];
}

export interface TrialMailInput {
  step: TrialStep;
  /** "December 12", in the household's time zone. */
  endsOn: string;
  /** Calendar days until the trial's last day: 0 is today. */
  daysLeft: number;
  usage: TrialUsage;
  siteUrl: string;
  unsubscribeUrl: string;
  postalAddress: string;
}

const household = MARKETING_PLANS.find((p) => p.id === "paid")!;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What the household did in its trial, one short line each, biggest first. Empty when it used nothing Household. */
export function usageLines(u: TrialUsage): string[] {
  const lines: [number, string][] = [
    [u.messages, `${plural(u.messages, "note")} posted to the message board`],
    [u.shopping, `${plural(u.shopping, "item")} added to the shopping list`],
    [u.meals, `${plural(u.meals, "meal")} planned`],
    [u.chores, `${plural(u.chores, "chore")} ticked off on the wall`],
    [u.photos, `${plural(u.photos, "photo")} added to the photo frame`],
  ];
  const out = lines
    .filter(([n]) => n > 0)
    .sort((a, b) => b[0] - a[0])
    .map(([, t]) => t);
  if (u.widgets.length) {
    const names = u.widgets.slice(0, 4).join(", ") + (u.widgets.length > 4 ? ` and ${u.widgets.length - 4} more` : "");
    out.push(`${plural(u.widgets.length, "Household widget")} on your wall: ${names}`);
  }
  if (u.features.length) out.push(`The ${u.features.join(", ")} running`);
  if (u.displays > 2) out.push(`${u.displays} screens connected (Free has room for 2)`);
  return out;
}

const SUGGESTIONS = [
  "A chore chart the kids tick off on the wall, with stars for the week",
  "Meals for the week and a shared shopping list, filled in from anyone's phone",
  "Notes on the message board that pop up on the wall the moment they're posted",
];

export function trialMail(m: TrialMailInput): { subject: string; text: string; html: string } {
  const last = m.step === "trial-13";
  const used = usageLines(m.usage);
  const when = m.daysLeft === 0 ? "today" : "tomorrow";
  const subject = last ? `Your Household trial ends ${when}` : `${m.daysLeft} days left in your Household trial`;
  const title = last ? (m.daysLeft === 0 ? "Your Trial Ends Today" : "Your Trial Ends Tomorrow") : "Here's Your Trial So Far";
  const intro = used.length
    ? last
      ? `Before Household switches off ${when}, here's what your family has been using:`
      : "Here's what your family has been using on Everydaypane so far:"
    : last
      ? `Your Household trial ends ${when}. If you haven't had a chance yet, these are worth a few minutes today:`
      : `Your Household trial has ${m.daysLeft} days left. If you haven't tried these yet, they're the ones families keep:`;
  const points = used.length ? used : SUGGESTIONS;
  const after = `On ${m.endsOn} the wall goes back to Free: Household widgets pause, and nothing you set up is deleted. Subscribe and it all stays as it is.`;
  const price = `Household is $${household.priceYearly} a year (about $${(household.priceYearly / 12).toFixed(2)} a month) or $${household.priceMonthly} a month.`;
  const cta = { label: "Keep Household", href: `${m.siteUrl}/household/#upgrade` };
  const preheader = last
    ? `Keep everything your family set up: ${price}`
    : `${used.length ? used[0] : "A few Household features worth trying"}.`;
  const why = "You're getting this because your household is on the Everydaypane Household trial.";

  const text = [
    last ? "Household trial · Last day" : `Household trial · ${m.daysLeft} days left`,
    title,
    "",
    intro,
    "",
    ...points.map((p) => `• ${p}`),
    "",
    after,
    price,
    "",
    `${cta.label}: ${cta.href}`,
    "",
    "--",
    why,
    `Unsubscribe from these emails: ${m.unsubscribeUrl}`,
    `${BRAND.name}, ${m.postalAddress}`,
  ].join("\n");

  const p = (s: string, extra = "") => `<p style="margin:0 0 14px${extra}">${escapeHtml(s)}</p>`;
  const bodyHtml = [
    p(intro),
    `<ul style="margin:0 0 14px;padding-left:20px">${points.map((pt) => `<li style="margin:0 0 8px">${escapeHtml(pt)}</li>`).join("")}</ul>`,
    p(after),
    `<p style="margin:18px 0 0;padding:12px 14px;border-radius:12px;font-size:14px;line-height:1.5;background:#fff7e6;border:1px solid #f5d08a;color:#7a4b00"><strong>Household plan.</strong> ${escapeHtml(price)}</p>`,
  ].join("");
  const unsub = escapeHtml(m.unsubscribeUrl);
  const html = emailHtml({
    preheader,
    title,
    bodyHtml,
    cta,
    accent: EMAIL.sun,
    kicker: {
      text: last ? "Household trial · Last day" : `Household trial · ${m.daysLeft} days left`,
      pill: { label: "Household", bg: "#fff1cc", ink: "#8a5a00" },
    },
    legalHtml: `${escapeHtml(why)}<br><a href="${unsub}" style="color:${EMAIL.soft}">Unsubscribe from these emails</a> · ${escapeHtml(BRAND.name)}, ${escapeHtml(m.postalAddress)}`,
  });
  return { subject, text, html };
}

/**
 * Which trial email is due, if any, from the calendar days between today and the trial's last day in the household's
 * time zone: day 10 once four or fewer are left, day 13 on the day before it ends (or the day itself, if the hourly job
 * missed that), and only day 13 when both are due, so a late start doesn't get two. Local 10 AM to 9 PM.
 */
export function dueTrialStep(daysUntilEnd: number, sent: ReadonlySet<string>, localHour: number): TrialStep | null {
  if (daysUntilEnd < 0 || localHour < 10 || localHour > 20) return null;
  if (daysUntilEnd <= 1) return sent.has("trial-13") ? null : "trial-13";
  if (daysUntilEnd <= 4) return sent.has("trial-10") ? null : "trial-10";
  return null;
}
