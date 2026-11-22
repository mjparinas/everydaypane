"use client";

import { useState } from "react";

import { findSpot, refit } from "@/lib/config/grid";
import type { View, Widget, WidgetType } from "@/lib/config/schema";
import { newWidget, WIDGET_TYPES, WIDGETS } from "@/lib/config/widgets";

import { ConfirmButton, NumberInput, Section, Select, Text } from "./fields";
import { GridEditor, widgetName } from "./GridEditor";
import { newId, useAdmin } from "./store";
import { WidgetSettings } from "./WidgetSettings";

// Views (Melvin, 2026-11-17: "several views to choose from"): each view is its own grid of widgets. Displays show one
// view, or follow the time-of-day schedule.

export function ViewsPanel() {
  const config = useAdmin((s) => s.config);
  const edit = useAdmin((s) => s.edit);
  const [viewId, setViewId] = useState(config.views[0]?.id ?? "");
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [picking, setPicking] = useState(false);

  const view = config.views.find((v) => v.id === viewId) ?? config.views[0];
  if (!view) return null;
  const vi = config.views.indexOf(view);
  const widget = view.widgets.find((w) => w.id === selected) ?? null;

  const editView = (change: (v: View) => void) => edit((c) => change(c.views[vi]!));
  const editWidget = (id: string, change: (w: Widget) => void) =>
    editView((v) => {
      const w = v.widgets.find((x) => x.id === id);
      if (w) change(w);
    });

  function resize(cols: number, rows: number) {
    const { kept, dropped } = refit(view!.widgets, { cols, rows });
    editView((v) => {
      v.cols = cols;
      v.rows = rows;
      v.widgets = kept;
    });
    setNotice(dropped.length ? `No room left for ${dropped.map(widgetName).join(", ")}, so they were taken off this view.` : "");
  }

  function add(type: WidgetType) {
    const info = WIDGETS[type];
    const spot = findSpot({ ...info.size, type }, view!, view!.widgets, info.minSize);
    setPicking(false);
    if (!spot) {
      setNotice(`There's no room for a ${info.label.toLowerCase()} widget. Make the grid bigger or move things around.`);
      return;
    }
    const w = { ...newWidget(type, newId(type), spot), w: spot.w, h: spot.h };
    editView((v) => void v.widgets.push(w));
    setSelected(w.id);
    setNotice("");
  }

  function addView() {
    const id = newId("view");
    edit(
      (c) =>
        void c.views.push({ id, name: `View ${c.views.length + 1}`, cols: 12, rows: 8, gap: 16, padding: 14, themeId: null, widgets: [] }),
    );
    setViewId(id);
    setSelected(null);
  }

  function duplicateView() {
    const id = newId("view");
    edit((c) => void c.views.push({ ...structuredClone(view!), id, name: `${view!.name} copy`.slice(0, 40) }));
    setViewId(id);
  }

  const usedBySchedule = (["morning", "afternoon", "evening", "night"] as const).filter((p) => config.schedule[p].viewId === view.id);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid content-start gap-4">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Views">
          {config.views.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={v.id === view.id}
              className={v.id === view.id ? "btn-primary" : "btn-ghost"}
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

        <GridEditor
          view={view}
          selectedId={selected}
          onSelect={setSelected}
          onChange={(id, r) => editWidget(id, (w) => Object.assign(w, r))}
        />
        {notice && (
          <p className="rounded-xl bg-bg p-3 text-sm" role="status">
            {notice}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => setPicking(!picking)} aria-expanded={picking}>
            + Add a widget
          </button>
          <a className="btn-ghost" href={`/admin/preview/${encodeURIComponent(view.id)}/?mode=day`} target="_blank" rel="noreferrer">
            Preview day ↗
          </a>
          <a className="btn-ghost" href={`/admin/preview/${encodeURIComponent(view.id)}/?mode=night`} target="_blank" rel="noreferrer">
            Preview night ↗
          </a>
        </div>
        {picking && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {WIDGET_TYPES.map((t) => (
              <button key={t} className="card grid gap-1 p-3 text-left hover:border-brand" onClick={() => add(t)}>
                <span className="text-2xl" aria-hidden="true">
                  {WIDGETS[t].icon}
                </span>
                <span className="font-semibold">{WIDGETS[t].label}</span>
                <span className="text-xs text-soft">{WIDGETS[t].description}</span>
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-soft">
          Drag a widget to move it and any of its corners to resize it. Tap one to change its settings and show all four corners. With a
          keyboard: arrows move, Shift + arrows move the bottom-right corner and Shift + Alt + arrows the top-left. Widgets can go on top of
          a photos widget, so the photos fill the space behind them.
        </p>
      </div>

      <div className="grid content-start gap-4">
        {widget ? (
          <Section
            title={widgetName(widget)}
            actions={
              <button className="btn-ghost min-h-9 px-3" onClick={() => setSelected(null)} aria-label="Close widget settings">
                ✕
              </button>
            }
          >
            <WidgetSettings widget={widget} config={config} onChange={(change) => editWidget(widget.id, change)} />
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <button
                className="btn-ghost"
                onClick={() => {
                  const spot = findSpot(widget, view, view.widgets, WIDGETS[widget.type].minSize);
                  if (!spot) return setNotice("There's no room for a copy on this view.");
                  const copy = { ...structuredClone(widget), id: newId(widget.type), ...spot };
                  editView((v) => void v.widgets.push(copy));
                  setSelected(copy.id);
                }}
              >
                Duplicate
              </button>
              <ConfirmButton
                label="Remove widget"
                onConfirm={() => {
                  editView((v) => void (v.widgets = v.widgets.filter((w) => w.id !== widget.id)));
                  setSelected(null);
                }}
              />
            </div>
          </Section>
        ) : null}

        <Section title="This view">
          <Text label="Name" value={view.name} maxLength={40} onChange={(v) => editView((x) => void (x.name = v))} />
          <div className="grid grid-cols-2 gap-3">
            <NumberInput label="Columns" value={view.cols} min={1} max={24} onChange={(n) => resize(n, view.rows)} />
            <NumberInput label="Rows" value={view.rows} min={1} max={24} onChange={(n) => resize(view.cols, n)} />
            <NumberInput label="Gap (px)" value={view.gap} min={0} max={48} onChange={(n) => editView((x) => void (x.gap = n))} />
            <NumberInput label="Edge (px)" value={view.padding} min={0} max={96} onChange={(n) => editView((x) => void (x.padding = n))} />
          </div>
          <Select
            label="Colour scheme"
            value={view.themeId ?? ""}
            options={[{ value: "", label: "The dashboard's scheme" }, ...config.themes.map((t) => ({ value: t.id, label: t.name }))]}
            onChange={(v) => editView((x) => void (x.themeId = v || null))}
          />
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={duplicateView} disabled={config.views.length >= 30}>
              Duplicate view
            </button>
            {config.views.length > 1 &&
              (usedBySchedule.length ? (
                <p className="text-xs text-soft">
                  The {usedBySchedule.join(" and ")} schedule uses this view, so it can&rsquo;t be deleted.
                </p>
              ) : (
                <ConfirmButton
                  label="Delete view"
                  onConfirm={() => {
                    edit((c) => void (c.views = c.views.filter((v) => v.id !== view.id)));
                    setViewId(config.views.find((v) => v.id !== view.id)?.id ?? "");
                    setSelected(null);
                  }}
                />
              ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
