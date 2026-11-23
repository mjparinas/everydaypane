"use client";

import { useMemo, useState } from "react";

import { findSpot, refit } from "@/lib/config/grid";
import type { View, Widget, WidgetType } from "@/lib/config/schema";
import { newWidget, WIDGET_GROUPS, WIDGET_TYPES, WIDGETS } from "@/lib/config/widgets";

import { Text } from "./fields";
import { LiveLayoutEditor, widgetName } from "./LiveLayoutEditor";
import { newId, useAdmin } from "./store";
import { ViewSettingsDrawer } from "./ViewSettingsDrawer";
import { WidgetSettingsDrawer } from "./WidgetSettingsDrawer";

// Views (Melvin, 2026-11-17: "several views to choose from"): each view is its own grid of widgets. Displays show one
// view, or follow the time-of-day schedule. Spacing defaults (12×8, gap 16, edge 14, tile 16) are tuned for a
// 1920 × 1080 UC-Display21 (Melvin, 2026-11-22).
//
// Layout (Melvin, 2026-11-22): one live editable preview; widget and view settings open in right slide-outs so gap,
// edge, tile and theme updates stay visible on the layout.

export function ViewsPanel() {
  const config = useAdmin((s) => s.config);
  const version = useAdmin((s) => s.version);
  const edit = useAdmin((s) => s.edit);
  const [viewId, setViewId] = useState(config.views[0]?.id ?? "");
  const [selected, setSelected] = useState<string | null>(null);
  const [editingView, setEditingView] = useState(false);
  const [notice, setNotice] = useState("");
  const [picking, setPicking] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");

  const found = config.views.find((v) => v.id === viewId) ?? config.views[0];
  const vi = found ? config.views.indexOf(found) : -1;
  const widget = found?.widgets.find((w) => w.id === selected) ?? null;

  const filteredTypes = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return null;
    return WIDGET_TYPES.filter((t) => {
      const info = WIDGETS[t];
      return info.label.toLowerCase().includes(q) || info.description.toLowerCase().includes(q);
    });
  }, [pickerQuery]);

  if (!found) return null;
  const active: View = found;

  const editView = (change: (v: View) => void) => edit((c) => change(c.views[vi]!));
  const editWidget = (id: string, change: (w: Widget) => void) =>
    editView((v) => {
      const w = v.widgets.find((x) => x.id === id);
      if (w) change(w);
    });

  function resize(cols: number, rows: number) {
    const { kept, dropped } = refit(active.widgets, { cols, rows });
    editView((v) => {
      v.cols = cols;
      v.rows = rows;
      v.widgets = kept;
    });
    setNotice(dropped.length ? `No room left for ${dropped.map(widgetName).join(", ")}, so they were taken off this view.` : "");
  }

  function add(type: WidgetType) {
    const info = WIDGETS[type];
    const spot = findSpot({ ...info.size, type }, active, active.widgets, info.minSize);
    setPicking(false);
    setPickerQuery("");
    if (!spot) {
      setNotice(`There's no room for a ${info.label.toLowerCase()} widget. Make the grid bigger or move things around.`);
      return;
    }
    const w = { ...newWidget(type, newId(type), spot), w: spot.w, h: spot.h };
    editView((v) => void v.widgets.push(w));
    setEditingView(false);
    setSelected(w.id);
    setNotice("");
  }

  function addView() {
    const id = newId("view");
    edit(
      (c) =>
        void c.views.push({
          id,
          name: `View ${c.views.length + 1}`,
          cols: 12,
          rows: 8,
          gap: 16,
          padding: 14,
          tilePadding: 16,
          themeId: null,
          widgets: [],
        }),
    );
    setViewId(id);
    setSelected(null);
    setEditingView(true);
  }

  function duplicateView() {
    const id = newId("view");
    edit((c) => void c.views.push({ ...structuredClone(active), id, name: `${active.name} copy`.slice(0, 40) }));
    setViewId(id);
    setSelected(null);
    setEditingView(true);
  }

  const usedBySchedule = (["morning", "afternoon", "evening", "night"] as const).filter((p) => config.schedule[p].viewId === active.id);

  return (
    <div className="grid content-start gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2" role="tablist" aria-label="Views">
          {config.views.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={v.id === active.id}
              className={v.id === active.id ? "btn-primary" : "btn-ghost"}
              onClick={() => {
                setViewId(v.id);
                setSelected(null);
                setNotice("");
              }}
            >
              {v.name}
            </button>
          ))}
          <button className="btn-ghost" onClick={addView} disabled={config.views.length >= 30}>
            + View
          </button>
        </div>
        <button
          type="button"
          className={editingView ? "btn-primary" : "btn-ghost"}
          aria-expanded={editingView}
          aria-controls={editingView ? "view-settings-drawer" : undefined}
          onClick={() => {
            setEditingView((open) => !open);
            setSelected(null);
          }}
        >
          Edit view
        </button>
      </div>

      <LiveLayoutEditor
        key={active.id}
        view={active}
        viewId={active.id}
        config={config}
        version={version}
        selectedId={selected}
        onSelect={(id) => {
          setSelected(id);
          if (id) setEditingView(false);
        }}
        onChange={(id, r) => editWidget(id, (w) => Object.assign(w, r))}
      />

      {widget && (
        <WidgetSettingsDrawer
          widget={widget}
          config={config}
          onChange={(change) => editWidget(widget.id, change)}
          onClose={() => setSelected(null)}
          onDuplicate={() => {
            const spot = findSpot(widget, active, active.widgets, WIDGETS[widget.type].minSize);
            if (!spot) return setNotice("There's no room for a copy on this view.");
            const copy = { ...structuredClone(widget), id: newId(widget.type), ...spot };
            editView((v) => void v.widgets.push(copy));
            setSelected(copy.id);
          }}
          onRemove={() => {
            editView((v) => void (v.widgets = v.widgets.filter((w) => w.id !== widget.id)));
            setSelected(null);
          }}
        />
      )}

      {editingView && !widget && (
        <ViewSettingsDrawer
          key={active.id}
          view={active}
          config={config}
          usedBySchedule={usedBySchedule}
          canDelete={config.views.length > 1}
          onClose={() => setEditingView(false)}
          onEdit={editView}
          onResize={resize}
          onDuplicate={duplicateView}
          onDelete={() => {
            edit((c) => void (c.views = c.views.filter((v) => v.id !== active.id)));
            setViewId(config.views.find((v) => v.id !== active.id)?.id ?? "");
            setSelected(null);
            setEditingView(false);
          }}
        />
      )}

      {notice && (
        <p className="rounded-xl bg-bg p-3 text-sm" role="status">
          {notice}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => setPicking(!picking)} aria-expanded={picking}>
          + Add a widget
        </button>
      </div>
      {picking && (
        <div className="grid gap-4 rounded-xl border border-line p-3">
          <Text label="Search widgets" value={pickerQuery} maxLength={40} placeholder="Clock, weather…" onChange={setPickerQuery} />
          {(filteredTypes ? [{ id: "search", label: "Matches", types: filteredTypes }] : WIDGET_GROUPS).map((group) =>
            group.types.length === 0 ? null : (
              <div key={group.id} className="grid gap-2">
                <h3 className="text-sm font-semibold text-soft">{group.label}</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                  {group.types.map((t) => (
                    <button key={t} className="card grid gap-1 p-3 text-left hover:border-brand" onClick={() => add(t)}>
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
        </div>
      )}
    </div>
  );
}
