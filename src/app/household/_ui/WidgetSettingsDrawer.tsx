"use client";

import type { DashboardConfig, Widget } from "@/lib/config/schema";
import { isFreeWidgetType } from "@/lib/plans";

import { ConfirmButton } from "./fields";
import { useWidgetLive } from "./flags";
import { widgetName } from "./LiveLayoutEditor";
import { HouseholdBadge, usePlan } from "./plan";
import { SlideDrawer } from "./SlideDrawer";
import { WidgetSettings } from "./WidgetSettings";

// Right slide-out for the selected widget (Melvin, 2026-11-22): keeps the live layout visible while editing options.

export function WidgetSettingsDrawer({
  widget,
  config,
  onChange,
  onClose,
  onDuplicate,
  onRemove,
}: {
  widget: Widget;
  config: DashboardConfig;
  onChange: (change: (w: Widget) => void) => void;
  onClose: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const { isPaid } = usePlan();
  const paidWidget = !isPaid && !isFreeWidgetType(widget.type);
  const live = useWidgetLive(widget);
  return (
    <SlideDrawer
      title={widgetName(widget)}
      openKey={widget.id}
      onClose={onClose}
      testId="widget-settings-drawer"
      closeLabel="Close widget settings"
    >
      {paidWidget ? (
        <p className="text-sm text-soft">
          This widget needs <HouseholdBadge className="align-middle" /> — Free can’t save it on the wall.
        </p>
      ) : null}
      {!live ? (
        <p className="rounded-xl bg-bg p-3 text-sm text-soft" role="note">
          Everydaypane has paused this integration for now, so the wall leaves this widget out. Its settings are kept and it comes back on
          its own.
        </p>
      ) : null}
      <WidgetSettings widget={widget} config={config} onChange={onChange} />
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <button type="button" className="btn-ghost" onClick={onDuplicate}>
          Duplicate
        </button>
        <ConfirmButton label="Remove Widget" onConfirm={onRemove} />
      </div>
    </SlideDrawer>
  );
}
