import { FREE_LIMITS, isFreeWidgetType } from "../plans";
import type { DashboardConfig, Widget } from "./schema";
import { WIDGETS } from "./widgets";

// What a Free household's wall shows when its settings hold Household things: after its Household trial ends
// (Melvin, 2026-11-28: "drops back to Free"), after staff move it to Free, or after a subscription lapses. The saved
// document is never changed here, so subscribing brings everything back as it was.

/** The Free-safe copy of the settings: one view, Free widgets only, and no Household-only switches. */
export function fitFree(config: DashboardConfig): DashboardConfig {
  const c = structuredClone(config);
  c.views = c.views
    .slice(0, FREE_LIMITS.views)
    .map((v) => ({ ...v, widgets: v.widgets.filter((w) => isFreeWidgetType(w.type)).map(slowPhotos) }));
  limitSwitches(c);
  return c;
}

/**
 * The wall's copy for a Free household: like `fitFree`, but each Household widget stays in its cell as a quiet note
 * that says it's paused, so the layout doesn't jump and the family knows why it went (the locked preview on Free
 * walls, Melvin, 2026-11-28). Nothing on it sells or links: anyone in the kitchen can read the wall.
 */
export function lockForFree(config: DashboardConfig): DashboardConfig {
  const c = structuredClone(config);
  c.views = c.views
    .slice(0, FREE_LIMITS.views)
    .map((v) => ({ ...v, widgets: v.widgets.map((w) => (isFreeWidgetType(w.type) ? slowPhotos(w) : lockedNote(w))) }));
  limitSwitches(c);
  return c;
}

function slowPhotos(w: Widget): Widget {
  return w.type === "photos" && w.intervalSeconds < FREE_LIMITS.minPhotoIntervalSeconds
    ? { ...w, intervalSeconds: FREE_LIMITS.minPhotoIntervalSeconds }
    : w;
}

function lockedNote(w: Widget): Widget {
  return {
    id: w.id,
    x: w.x,
    y: w.y,
    w: w.w,
    h: w.h,
    title: WIDGETS[w.type].label,
    showBackground: true,
    ...(w.outerPadding === undefined ? {} : { outerPadding: w.outerPadding }),
    type: "note",
    text: "Paused on the Free plan. Turn it back on with Household.",
    size: "s",
  };
}

function limitSwitches(c: DashboardConfig): void {
  c.schedule = { ...c.schedule, enabled: false };
  c.screenSaver = { ...c.screenSaver, idle: false, night: false };
  c.messagePopups = { ...c.messagePopups, enabled: false };
  c.alerts = { ...c.alerts, notifyEmail: false };
  c.integrations.icals = c.integrations.icals.map((i) => ({ ...i, enabled: false }));
  let calendars = 0;
  const keep = <T extends { enabled: boolean }>(cal: T): T => {
    if (!cal.enabled) return cal;
    calendars += 1;
    return calendars <= FREE_LIMITS.calendars ? cal : { ...cal, enabled: false };
  };
  c.integrations.google.calendars = c.integrations.google.calendars.map(keep);
  c.integrations.microsoft.calendars = c.integrations.microsoft.calendars.map(keep);
}
