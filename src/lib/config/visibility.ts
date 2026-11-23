import type { Period } from "./periods";
import type { Widget } from "./schema";

/** Whether a widget should mount for the current part of the day (Melvin, 2026-11-23). */
export function widgetVisible(widget: Widget, period: Period | null): boolean {
  const pick = widget.visiblePeriods;
  if (!pick?.length) return true;
  if (!period) return true;
  return pick.includes(period);
}
