import { BRAND } from "./brand";
import { EMAIL, emailHtml, escapeHtml } from "./email";
import { MARKETING_PLANS } from "./marketingPlans";
import type { OnboardingStep } from "./onboarding";
import type { PlanId } from "./plans";

// One getting-started email (src/lib/onboarding.ts) in the shared Everydaypane chrome (src/lib/email.ts): kicker,
// title, opening line, the picture, the points, an optional tip, and for Household features a clear "Household plan"
// box. A Free household's Household email sells the upgrade and its button opens the upgrade dialog; a paying
// household is told it's already included and sent straight to the setting. Plain text first, with an HTML twin.

/** Shown at 504 px (the card's inner width); the files are twice that for sharp phones and retina screens. */
export const IMAGE_WIDTH = 504;
export const IMAGE_HEIGHT = 315;

export interface OnboardingMailInput {
  step: OnboardingStep;
  n: number;
  total: number;
  plan: PlanId;
  siteUrl: string;
  unsubscribeUrl: string;
  postalAddress: string;
}

export interface OnboardingMail {
  subject: string;
  text: string;
  html: string;
}

const household = MARKETING_PLANS.find((p) => p.id === "paid")!;
const price = `$${household.priceMonthly} a month or $${household.priceYearly} a year`;

export function onboardingMail(m: OnboardingMailInput): OnboardingMail {
  const { step, plan, siteUrl } = m;
  const paidStep = step.tier === "household";
  const upsell = paidStep && plan !== "paid";
  const kicker = `Getting started · ${m.n} of ${m.total}`;
  const cta = upsell
    ? { label: "See what Household adds", href: `${siteUrl}/household/#upgrade` }
    : { label: step.cta.label, href: `${siteUrl}${step.cta.path}` };
  const planLine = !paidStep
    ? ""
    : upsell
      ? `This is part of the Household plan, ${price}. Everything you have on Free stays as it is.`
      : "This is included in your Household plan.";
  const why = "You're getting this because you started an Everydaypane household. One email a day while you settle in.";

  const text = [
    kicker,
    step.title,
    "",
    step.intro,
    "",
    ...step.points.map((p) => `• ${p.text}`),
    "",
    ...(step.tip ? [step.tip, ""] : []),
    ...(planLine ? [planLine, ""] : []),
    `${cta.label}: ${cta.href}`,
    "",
    "--",
    why,
    `Unsubscribe from these tips: ${m.unsubscribeUrl}`,
    `${BRAND.name}, ${m.postalAddress}`,
  ].join("\n");

  const img = `${siteUrl}/email/onboarding/${step.image.file}.jpg`;
  const p = (s: string, extra = "") => `<p style="margin:0 0 14px${extra}">${escapeHtml(s)}</p>`;
  const box = planLine
    ? `<p style="margin:18px 0 0;padding:12px 14px;border-radius:12px;font-size:14px;line-height:1.5;${
        upsell
          ? `background:#fff7e6;border:1px solid #f5d08a;color:#7a4b00`
          : `background:#ebf6ee;border:1px solid #b6dfc0;color:${EMAIL.good}`
      }"><strong>${upsell ? "Household plan only." : "Household plan."}</strong> ${escapeHtml(planLine.replace(/^This is /, "It's "))}</p>`
    : "";
  const bodyHtml = [
    p(step.intro),
    `<a href="${escapeHtml(cta.href)}" target="_blank" style="display:block;margin:6px 0 18px;text-decoration:none"><img src="${escapeHtml(img)}" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" alt="${escapeHtml(step.image.alt)}" style="display:block;width:100%;max-width:${IMAGE_WIDTH}px;height:auto;border:1px solid ${EMAIL.line};border-radius:14px;outline:none"></a>`,
    `<ul style="margin:0 0 14px;padding-left:20px">${step.points.map((pt) => `<li style="margin:0 0 8px">${escapeHtml(pt.text)}</li>`).join("")}</ul>`,
    step.tip ? p(step.tip, `;color:${EMAIL.soft};font-size:14px`) : "",
    box,
  ].join("");

  const unsub = escapeHtml(m.unsubscribeUrl);
  const html = emailHtml({
    preheader: step.preheader,
    title: step.title,
    bodyHtml,
    cta,
    accent: paidStep ? EMAIL.sun : EMAIL.brand,
    kicker: {
      text: kicker,
      pill: paidStep
        ? upsell
          ? { label: "Household", bg: "#fff1cc", ink: "#8a5a00" }
          : { label: "In your plan", bg: "#ebf6ee", ink: EMAIL.good }
        : { label: "Free", bg: "#e8edfc", ink: EMAIL.brand },
    },
    legalHtml: `${escapeHtml(why)}<br><a href="${unsub}" style="color:${EMAIL.soft}">Unsubscribe from these tips</a> · ${escapeHtml(BRAND.name)}, ${escapeHtml(m.postalAddress)}`,
  });
  return { subject: step.subject, text, html };
}
