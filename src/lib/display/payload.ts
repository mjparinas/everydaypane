import type { DashboardConfig, Theme } from "@/lib/config/schema";
import type { DisplayPayload } from "@/lib/display/types";

/** Enough of a device for the display payload: id, name, and which view it shows (null = schedule). */
export type DisplayDevice = { id: string; name: string; viewId: string | null };

/** The settings a display needs: only reachable views, only the themes they use, no integration settings. */
export function displayPayload(
  config: DashboardConfig,
  version: number,
  device: DisplayDevice | null,
  previewViewId: string | null = null,
  opts: { instantRefresh?: boolean } = {},
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
      enabled: Boolean(doorbell.entityId && doorbell.cameraEntityId),
      seconds: doorbell.seconds,
      entityId: doorbell.entityId,
      cameraEntityId: doorbell.cameraEntityId,
    },
    screenSaver: config.screenSaver,
    instantRefresh: opts.instantRefresh === true,
  };
}
