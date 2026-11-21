import "server-only";

import type { DashboardConfig, Theme } from "@/lib/config/schema";
import type { DisplayPayload } from "@/lib/display/types";

import type { Device } from "./devices";

/** The settings a display needs: only reachable views, only the themes they use, no integration settings. */
export function displayPayload(
  config: DashboardConfig,
  version: number,
  device: Device | null,
  previewViewId: string | null = null,
): DisplayPayload {
  const fixed = previewViewId ?? (device?.viewId && config.views.some((v) => v.id === device.viewId) ? device.viewId : null);
  const scheduled = config.schedule.enabled
    ? [config.schedule.morning.viewId, config.schedule.afternoon.viewId, config.schedule.evening.viewId, config.schedule.night.viewId]
    : [];
  const wanted = new Set(fixed ? [fixed] : scheduled.length ? scheduled : [config.views[0]?.id ?? ""]);
  const views = config.views.filter((v) => wanted.has(v.id));
  const themeIds = new Set([config.themeId, ...views.map((v) => v.themeId).filter((t): t is string => t !== null)]);
  const themes: Record<string, Theme> = {};
  for (const t of config.themes) if (themeIds.has(t.id)) themes[t.id] = t;
  const doorbell = config.integrations.homeAssistant.doorbell;
  const go2rtc = go2rtcBase(config);
  const bellStream = go2rtc ? doorbell.stream : "";
  return {
    version,
    device: device ? { id: device.id, name: device.name } : null,
    name: config.name,
    location: { name: config.location.name, timeZone: config.location.timeZone },
    units: config.units,
    hour12: config.hour12,
    themes,
    themeId: config.themeId,
    views,
    fixedViewId: fixed ?? (config.schedule.enabled ? null : (views[0]?.id ?? null)),
    schedule: config.schedule,
    burnIn: config.burnIn,
    alerts: { enabled: config.alerts.enabled, banner: config.alerts.banner },
    doorbell: {
      enabled: Boolean(doorbell.entityId && (doorbell.cameraEntityId || bellStream)),
      seconds: doorbell.seconds,
      entityId: doorbell.entityId,
      cameraEntityId: doorbell.cameraEntityId,
      stream: bellStream,
    },
    go2rtcUrl: go2rtc,
  };
}

/** The go2rtc server's address without a trailing slash, or "" when live cameras aren't set up. */
export function go2rtcBase(config: DashboardConfig): string {
  return config.integrations.cameras.go2rtcUrl.replace(/\/+$/, "");
}

/** The origin display pages may play camera video from (their Content-Security-Policy), or "". */
export function mediaOrigin(config: DashboardConfig): string {
  const base = go2rtcBase(config);
  return base ? new URL(base).origin : "";
}
