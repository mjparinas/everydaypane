import "server-only";

import type { DashboardConfig } from "@/lib/config/schema";
import { FREE_LIMITS, isFreeWidgetType, limitsFor, type PlanId } from "@/lib/plans";

import { accountById } from "./accounts";
import { countDevices } from "./devices";

export async function planForAccount(accountId: string): Promise<PlanId> {
  const account = await accountById(accountId);
  return account?.plan ?? "free";
}

export type GateResult = { ok: true } | { ok: false; error: string };

/** Rejects a settings save that Free households are not allowed to keep. */
export function gateConfig(plan: PlanId, config: DashboardConfig): GateResult {
  const limits = limitsFor(plan);
  if (config.views.length > limits.views) {
    return {
      ok: false,
      error: plan === "free" ? `Free includes ${limits.views} view. Upgrade to Household for more.` : `At most ${limits.views} views.`,
    };
  }
  if (plan === "free") {
    for (const view of config.views) {
      for (const w of view.widgets) {
        if (!isFreeWidgetType(w.type)) {
          return { ok: false, error: `The ${w.type} widget needs Household. Remove it or upgrade.` };
        }
        if (w.type === "photos" && w.intervalSeconds < FREE_LIMITS.minPhotoIntervalSeconds) {
          return {
            ok: false,
            error: `Free photo changes are at least every ${FREE_LIMITS.minPhotoIntervalSeconds} seconds.`,
          };
        }
      }
    }
    if (config.schedule.enabled) {
      return { ok: false, error: "Time-of-day schedules need Household. Turn the schedule off or upgrade." };
    }
    if (config.screenSaver.idle || config.screenSaver.night) {
      return { ok: false, error: "The screen saver needs Household. Turn it off or upgrade." };
    }
    if (config.messagePopups.enabled) {
      return { ok: false, error: "Message pop-ups need Household. Turn them off or upgrade." };
    }
    if (config.alerts.notifyEmail) {
      return { ok: false, error: "Alert emails need Household. Turn them off or upgrade." };
    }
    // Marketing: iCal links are Household-only (Google/Microsoft calendars still count toward Free's calendar cap).
    if (config.integrations.icals.some((c) => c.enabled)) {
      return { ok: false, error: "iCal calendar links need Household. Remove them or upgrade." };
    }
  }
  const calendars =
    config.integrations.google.calendars.filter((c) => c.enabled).length +
    config.integrations.microsoft.calendars.filter((c) => c.enabled).length +
    config.integrations.icals.filter((c) => c.enabled).length;
  if (calendars > limits.calendars) {
    return {
      ok: false,
      error:
        plan === "free"
          ? `Free includes ${limits.calendars} calendars. Upgrade to Household for more.`
          : `At most ${limits.calendars} calendars.`,
    };
  }
  return { ok: true };
}

export async function gateNewDisplay(accountId: string): Promise<GateResult> {
  const plan = await planForAccount(accountId);
  const limits = limitsFor(plan);
  const n = await countDevices(accountId);
  if (n >= limits.displays) {
    return {
      ok: false,
      error: plan === "free" ? `Free includes ${limits.displays} displays. Upgrade to Household for more.` : "Display limit reached.",
    };
  }
  return { ok: true };
}
