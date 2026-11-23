"use client";

import type { DashboardConfig, Widget } from "@/lib/config/schema";

import { ConfirmButton } from "./fields";
import { widgetName } from "./LiveLayoutEditor";
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
  return (
    <SlideDrawer
      title={widgetName(widget)}
      openKey={widget.id}
      onClose={onClose}
      testId="widget-settings-drawer"
      closeLabel="Close widget settings"
    >
      <WidgetSettings widget={widget} config={config} onChange={onChange} />
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <button type="button" className="btn-ghost" onClick={onDuplicate}>
          Duplicate
        </button>
        <ConfirmButton label="Remove widget" onConfirm={onRemove} />
      </div>
    </SlideDrawer>
  );
}
