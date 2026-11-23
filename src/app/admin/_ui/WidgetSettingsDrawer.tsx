"use client";

import { useEffect, useId, useRef } from "react";

import type { DashboardConfig, Widget } from "@/lib/config/schema";

import { ConfirmButton } from "./fields";
import { widgetName } from "./LiveLayoutEditor";
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
  const titleId = useId();
  const closeBtn = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const name = widgetName(widget);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Focus the close control only when the drawer opens or the selected widget changes — not on every
  // parent re-render (inline onClose would otherwise steal focus after each keystroke in Title).
  useEffect(() => {
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [widget.id]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" data-testid="widget-settings-drawer">
      <button type="button" className="absolute inset-0 bg-black/25" aria-label="Close widget settings" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-[min(100%,24rem)] max-w-[calc(100%-2.5rem)] flex-col border-l border-line bg-panel shadow-xl [animation:slide-in-right_180ms_ease-out]"
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-base font-semibold">
            {name}
          </h2>
          <button ref={closeBtn} type="button" className="btn-ghost min-h-9 px-3" onClick={onClose} aria-label="Close widget settings">
            ✕
          </button>
        </div>
        <div className="grid flex-1 content-start gap-4 overflow-y-auto p-4 pb-[calc(5rem+env(safe-area-inset-bottom))]">
          <WidgetSettings widget={widget} config={config} onChange={onChange} />
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <button type="button" className="btn-ghost" onClick={onDuplicate}>
              Duplicate
            </button>
            <ConfirmButton label="Remove widget" onConfirm={onRemove} />
          </div>
        </div>
      </div>
    </div>
  );
}
