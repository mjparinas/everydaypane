"use client";

import { useState } from "react";

import type { DashboardConfig, View } from "@/lib/config/schema";

import { ConfirmButton, Range, Segmented, Select, Stepper, Text } from "./fields";
import { SlideDrawer } from "./SlideDrawer";

const GRID_PRESETS = [
  { value: "12x8", label: "12×8 (1080p)", cols: 12, rows: 8 },
  { value: "8x12", label: "8×12 (portrait)", cols: 8, rows: 12 },
  { value: "10x6", label: "10×6", cols: 10, rows: 6 },
  { value: "16x9", label: "16×9", cols: 16, rows: 9 },
] as const;

type GridPreset = (typeof GRID_PRESETS)[number]["value"] | "custom";

function presetFor(cols: number, rows: number): GridPreset {
  return GRID_PRESETS.find((p) => p.cols === cols && p.rows === rows)?.value ?? "custom";
}

// Right slide-out for this view's grid and theme (Melvin, 2026-11-22): edit while watching the live layout.

export function ViewSettingsDrawer({
  view,
  config,
  usedBySchedule,
  canDelete,
  onClose,
  onEdit,
  onResize,
  onDuplicate,
  onDelete,
}: {
  view: View;
  config: DashboardConfig;
  usedBySchedule: string[];
  canDelete: boolean;
  onClose: () => void;
  onEdit: (change: (v: View) => void) => void;
  onResize: (cols: number, rows: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const known = presetFor(view.cols, view.rows);
  // Custom must still light up when the grid already matches a preset, so the column/row steppers appear
  // (same idea as the photos widget's custom interval).
  const [forceCustom, setForceCustom] = useState(known === "custom");
  const gridPreset: GridPreset = forceCustom || known === "custom" ? "custom" : known;

  return (
    <SlideDrawer
      title={view.name || "This view"}
      openKey={view.id}
      onClose={onClose}
      testId="view-settings-drawer"
      closeLabel="Close view settings"
    >
      <Text label="Name" value={view.name} maxLength={40} onChange={(v) => onEdit((x) => void (x.name = v))} />
      <Segmented
        label="Grid size"
        value={gridPreset}
        options={[
          ...GRID_PRESETS.map((p) => ({ value: p.value as GridPreset, label: p.label })),
          { value: "custom" as const, label: "Custom" },
        ]}
        hint="12×8 fits a 1920 × 1080 wall; 8×12 fits a tall tablet or fridge panel."
        onChange={(v) => {
          if (v === "custom") {
            setForceCustom(true);
            return;
          }
          setForceCustom(false);
          const p = GRID_PRESETS.find((x) => x.value === v);
          if (p) onResize(p.cols, p.rows);
        }}
      />
      {(forceCustom || known === "custom") && (
        <div className="grid grid-cols-2 gap-3">
          <Stepper label="Columns" value={view.cols} min={1} max={24} onChange={(n) => onResize(n, view.rows)} />
          <Stepper label="Rows" value={view.rows} min={1} max={24} onChange={(n) => onResize(view.cols, n)} />
        </div>
      )}
      <Range
        label="Gap between tiles"
        value={view.gap}
        min={0}
        max={48}
        step={1}
        format={(n) => `${n} px`}
        hint="Space between widgets on the wall."
        onChange={(n) => onEdit((x) => void (x.gap = n))}
      />
      <Range
        label="Edge inset"
        value={view.padding}
        min={0}
        max={96}
        step={1}
        format={(n) => `${n} px`}
        hint="Padding from the screen edge to the grid."
        onChange={(n) => onEdit((x) => void (x.padding = n))}
      />
      <Range
        label="Padding inside tiles"
        value={view.tilePadding}
        min={0}
        max={48}
        step={1}
        format={(n) => `${n} px`}
        hint="Space inside each panel. Photos, cameras and radar still fill their cell."
        onChange={(n) => onEdit((x) => void (x.tilePadding = n))}
      />
      <Select
        label="Colour scheme"
        value={view.themeId ?? ""}
        options={[{ value: "", label: "Use the dashboard default" }, ...config.themes.map((t) => ({ value: t.id, label: t.name }))]}
        onChange={(v) => onEdit((x) => void (x.themeId = v || null))}
      />
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <button type="button" className="btn-ghost" onClick={onDuplicate} disabled={config.views.length >= 30}>
          Duplicate view
        </button>
        {canDelete &&
          (usedBySchedule.length ? (
            <p className="text-xs text-soft">The {usedBySchedule.join(" and ")} schedule uses this view, so it can&rsquo;t be deleted.</p>
          ) : (
            <ConfirmButton label="Delete view" onConfirm={onDelete} />
          ))}
      </div>
    </SlideDrawer>
  );
}
