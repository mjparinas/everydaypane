"use client";

import { useState } from "react";

import type { DashboardConfig, View } from "@/lib/config/schema";
import { featureFlag } from "@/lib/featureFlags";

import { ConfirmButton, Range, Segmented, Select, Stepper, Text, Toggle } from "./fields";
import { useFlags } from "./flags";
import { HouseholdBadge, usePlan } from "./plan";
import { SlideDrawer } from "./SlideDrawer";
import { useAdmin } from "./store";

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
  usedBySaver = false,
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
  usedBySaver?: boolean;
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
      <IdleViewToggle viewId={view.id} />
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <button type="button" className="btn-ghost" onClick={onDuplicate} disabled={config.views.length >= 30}>
          Duplicate view
        </button>
        {canDelete &&
          (usedBySchedule.length ? (
            <p className="text-xs text-soft">The {usedBySchedule.join(" and ")} schedule uses this view, so it can&rsquo;t be deleted.</p>
          ) : usedBySaver ? (
            <p className="text-xs text-soft">
              The screen saver shows this view when nobody&rsquo;s using the screen, so it can&rsquo;t be deleted. Pick another in Settings
              › Screen saver first.
            </p>
          ) : (
            <ConfirmButton label="Delete view" onConfirm={onDelete} />
          ))}
      </div>
    </SlideDrawer>
  );
}

// Make this view the screen saver's idle screen straight from the view it is (Melvin, 2026-11-26: the screen saver
// "needs to be more prominent"). Same settings as Settings › Screen saver; one idle view per household.
function IdleViewToggle({ viewId }: { viewId: string }) {
  const saver = useAdmin((st) => st.config.screenSaver);
  const edit = useAdmin((st) => st.edit);
  const { isPaid, openUpgrade } = usePlan();
  const isIdle = saver.idle && saver.shows === "view" && saver.viewId === viewId;
  const idleViewOn = useFlags().on(featureFlag("idleView"));

  if (!idleViewOn) return null;

  if (!isPaid) {
    return (
      <div className="grid gap-2 border-t border-line pt-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          Screen saver <HouseholdBadge />
        </p>
        <p className="text-xs text-soft">On Household, any view can be the photo frame the wall shows when nobody&rsquo;s using it.</p>
        <button type="button" className="btn-ghost justify-self-start" onClick={() => openUpgrade("screenSaver")}>
          See why Household
        </button>
      </div>
    );
  }
  return (
    <div className="border-t border-line pt-4">
      <Toggle
        label="Show when nobody's using the screen"
        checked={isIdle}
        hint={
          isIdle
            ? `The screen saver shows this view after ${saver.minutes} min without a touch. A tap goes back to the dashboard.`
            : "Makes this the screen saver's idle view, like a photo frame. Timing and night hours are in Settings › Screen saver."
        }
        onChange={(on) =>
          edit((c) => {
            if (on) {
              c.screenSaver.idle = true;
              c.screenSaver.shows = "view";
              c.screenSaver.viewId = viewId;
            } else {
              c.screenSaver.shows = "photos";
            }
          })
        }
      />
    </div>
  );
}
