"use client";

import { useMemo, useState } from "react";

import type { WidgetType } from "@/lib/config/schema";
import { WIDGET_GROUPS, WIDGET_TYPES, WIDGETS } from "@/lib/config/widgets";

import { Text } from "./fields";
import { SlideDrawer } from "./SlideDrawer";

// Right slide-out widget picker (Melvin, 2026-11-22): same chrome as Edit view / widget settings so the live
// layout stays visible while choosing what to add.

export function AddWidgetDrawer({ onClose, onPick }: { onClose: () => void; onPick: (type: WidgetType) => void }) {
  const [query, setQuery] = useState("");
  const filteredTypes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return WIDGET_TYPES.filter((t) => {
      const info = WIDGETS[t];
      return info.label.toLowerCase().includes(q) || info.description.toLowerCase().includes(q);
    });
  }, [query]);

  return (
    <SlideDrawer title="Add a widget" openKey="add-widget" onClose={onClose} testId="add-widget-drawer" closeLabel="Close widget picker">
      <Text label="Search widgets" value={query} maxLength={40} placeholder="Clock, weather…" onChange={setQuery} />
      {(filteredTypes ? [{ id: "search", label: "Matches", types: filteredTypes }] : WIDGET_GROUPS).map((group) =>
        group.types.length === 0 ? null : (
          <div key={group.id} className="grid gap-2">
            <h3 className="text-sm font-semibold text-soft">{group.label}</h3>
            <div className="grid grid-cols-2 gap-2">
              {group.types.map((t) => (
                <button key={t} type="button" className="card grid gap-1 p-3 text-left hover:border-brand" onClick={() => onPick(t)}>
                  <span className="text-2xl" aria-hidden="true">
                    {WIDGETS[t].icon}
                  </span>
                  <span className="font-semibold">{WIDGETS[t].label}</span>
                  <span className="text-xs text-soft">{WIDGETS[t].description}</span>
                </button>
              ))}
            </div>
          </div>
        ),
      )}
    </SlideDrawer>
  );
}
