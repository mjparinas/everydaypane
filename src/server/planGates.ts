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
    return { ok: false, error: `Free includes ${limits.views} view. Upgrade to Household for more.` };
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
  }
  const calendars =
    config.integrations.google.calendars.filter((c) => c.enabled).length + config.integrations.icals.filter((c) => c.enabled).length;
  if (calendars > limits.calendars) {
    return { ok: false, error: `Free includes ${limits.calendars} calendars. Upgrade to Household for more.` };
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
