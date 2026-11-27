"use client";

import { useRef, useState } from "react";

import { findSpot, refit } from "@/lib/config/grid";
import { PERIOD_LABELS, PERIODS } from "@/lib/config/periods";
import type { View, Widget, WidgetType } from "@/lib/config/schema";
import { TEMPLATE_CATEGORIES, TEMPLATE_CATEGORY_LABELS, VIEW_TEMPLATES } from "@/lib/config/templates";
import { newWidget, WIDGETS } from "@/lib/config/widgets";
import { FREE_LIMITS, PAID_LIMITS } from "@/lib/plans";

import { AddWidgetDrawer } from "./AddWidgetDrawer";
import { Section } from "./fields";
import { LiveLayoutEditor, widgetName } from "./LiveLayoutEditor";
import { HouseholdBadge, UpgradeLink, usePlan } from "./plan";
import { newId, useAdmin } from "./store";
import { ViewSettingsDrawer } from "./ViewSettingsDrawer";
import { WidgetSettingsDrawer } from "./WidgetSettingsDrawer";

// Views (Melvin, 2026-11-17: "several views to choose from"): each view is its own grid of widgets. Displays show one
// view, or follow the time-of-day schedule. Spacing defaults (12×8, gap 16, edge 14, tile 16) are tuned for a
// 1920 × 1080 landscape wall panel (Melvin, 2026-11-22).
//
// Layout (Melvin, 2026-11-22): one live editable preview; widget and view settings open in right slide-outs so gap,
// edge, tile and theme updates stay visible on the layout. Add a widget uses the same drawer.

export function ViewsPanel() {
  const config = useAdmin((s) => s.config);
  const version = useAdmin((s) => s.version);
  const edit = useAdmin((s) => s.edit);
  const { isPaid, openUpgrade } = usePlan();
  const viewLimit = isPaid ? PAID_LIMITS.views : FREE_LIMITS.views;
  const [viewId, setViewId] = useState(config.views[0]?.id ?? "");
  const [selected, setSelected] = useState<string | null>(null);
  const [editingView, setEditingView] = useState(false);
  const [picking, setPicking] = useState(false);
  const [notice, setNotice] = useState("");
  // Templates stay collapsed so the live wall stays the hero (H2, 2026-11-24). Empty views open them by default.
  const [templatesOpen, setTemplatesOpen] = useState(() => false);
  const previewRef = useRef<HTMLDivElement>(null);
  const templatesRef = useRef<HTMLDivElement>(null);

  const found = config.views.find((v) => v.id === viewId) ?? config.views[0];
  const vi = found ? config.views.indexOf(found) : -1;
  const widget = found?.widgets.find((w) => w.id === selected) ?? null;

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
    if (config.views.length >= viewLimit) {
      if (!isPaid) openUpgrade("view");
      else setNotice("You already have the maximum number of views.");
      return;
    }
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
    setPicking(false);
    setEditingView(true);
  }

  function duplicateView() {
    if (config.views.length >= viewLimit) {
      if (!isPaid) openUpgrade("view");
      else setNotice("You already have the maximum number of views.");
      return;
    }
    const id = newId("view");
    edit((c) => void c.views.push({ ...structuredClone(active), id, name: `${active.name} copy`.slice(0, 40) }));
    setViewId(id);
    setSelected(null);
    setPicking(false);
    setEditingView(true);
  }

  function applyTemplate(templateId: string) {
    const template = VIEW_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    if (!isPaid && template.tier === "paid") {
      openUpgrade("template");
      return;
    }
    if (config.views.length >= viewLimit) {
      if (!isPaid) openUpgrade("view");
      else setNotice("You already have the maximum number of views.");
      return;
    }
    const built = template.build();
    const id = newId("view");
    const themeOk = template.themeId === null || config.themes.some((th) => th.id === template.themeId);
    edit((c) => {
      c.views.push({
        id,
        name: template.name.slice(0, 40),
        ...built,
        themeId: themeOk ? template.themeId : null,
        widgets: built.widgets.map((w) => ({ ...w, id: newId(w.type) })),
      });
    });
    setViewId(id);
    setSelected(null);
    setEditingView(true);
    setNotice(`Added “${template.name}”. Save when you're happy with it.`);
    // Templates sit below a long gallery; bring the live preview back into view.
    requestAnimationFrame(() => {
      previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const templatesByCategory = TEMPLATE_CATEGORIES.map((category) => ({
    category,
    label: TEMPLATE_CATEGORY_LABELS[category],
    templates: VIEW_TEMPLATES.filter((t) => t.category === category),
  })).filter((g) => g.templates.length > 0);

  const usedBySchedule = PERIODS.filter((p) => config.schedule[p].viewId === active.id).map((p) => PERIOD_LABELS[p].toLowerCase());
  // The screen saver's idle view can't be deleted out from under it either (Melvin, 2026-11-26).
  const usedBySaver = config.screenSaver.idle && config.screenSaver.shows === "view" && config.screenSaver.viewId === active.id;
  const emptyView = active.widgets.length === 0;
  const showTemplates = templatesOpen || emptyView;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
      {/* The tab list's basis is its content (not 0), so on a phone it takes its own row and scrolls sideways instead of
          squeezing to one chip per line under the action buttons (Melvin's Android screenshot, 2026-11-26). */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="-mx-1 flex min-w-0 flex-[1_1_auto] items-center gap-2 overflow-x-auto px-1 py-0.5 max-sm:[scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&>button]:shrink-0 max-sm:[&>button]:min-h-10 max-sm:[&>button]:px-3.5 max-sm:[&>button]:text-sm"
          role="tablist"
          aria-label="Views"
        >
          {config.views.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={v.id === active.id}
              className={v.id === active.id ? "btn-primary" : "btn-ghost"}
              onClick={() => {
                setViewId(v.id);
                setSelected(null);
                setPicking(false);
                setNotice("");
              }}
            >
              {v.name}
              {config.screenSaver.idle && config.screenSaver.shows === "view" && config.screenSaver.viewId === v.id ? (
                <span className="ml-1.5 text-xs opacity-70" title="The screen saver shows this view when nobody's using the screen">
                  · idle
                </span>
              ) : null}
            </button>
          ))}
          <button
            className={`btn-ghost ${!isPaid && config.views.length >= viewLimit ? "opacity-60" : ""}`}
            onClick={addView}
            disabled={isPaid && config.views.length >= viewLimit}
          >
            + View
            {!isPaid && config.views.length >= viewLimit ? <HouseholdBadge className="ml-1.5" /> : null}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 max-sm:[&>button]:min-h-10 max-sm:[&>button]:px-3.5 max-sm:[&>button]:text-sm">
          <button
            type="button"
            className={picking ? "btn-primary" : "btn-ghost"}
            aria-expanded={picking}
            aria-controls={picking ? "add-widget-drawer" : undefined}
            onClick={() => {
              setPicking((open) => !open);
              setEditingView(false);
              setSelected(null);
            }}
          >
            + Add a Widget
          </button>
          <button
            type="button"
            className={editingView ? "btn-primary" : "btn-ghost"}
            aria-expanded={editingView}
            aria-controls={editingView ? "view-settings-drawer" : undefined}
            onClick={() => {
              setEditingView((open) => !open);
              setPicking(false);
              setSelected(null);
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M11.5 1.5a1.4 1.4 0 0 1 2 2L4.8 12.2 2 13l.8-2.8L11.5 1.5Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path d="M10.2 2.8 13.2 5.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Edit View
          </button>
          {!emptyView ? (
            <button
              type="button"
              className={templatesOpen ? "btn-primary" : "btn-ghost"}
              aria-expanded={templatesOpen}
              aria-controls="starter-templates"
              onClick={() => {
                setTemplatesOpen((o) => {
                  const next = !o;
                  if (next) {
                    // Gallery sits under the tall live preview — scroll + status so opening isn't a silent no-op.
                    setNotice("Starter templates are below the preview.");
                    requestAnimationFrame(() => {
                      templatesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    });
                  } else {
                    setNotice("");
                  }
                  return next;
                });
              }}
            >
              Starter Templates
            </button>
          ) : null}
        </div>
      </div>

      <div ref={previewRef} className="scroll-mt-28">
        <LiveLayoutEditor
          key={active.id}
          view={active}
          viewId={active.id}
          config={config}
          version={version}
          selectedId={selected}
          onSelect={(id) => {
            setSelected(id);
            if (id) {
              setEditingView(false);
              setPicking(false);
            }
          }}
          onChange={(id, r) => editWidget(id, (w) => Object.assign(w, r))}
        />
      </div>

      {picking && !widget && !editingView && <AddWidgetDrawer onClose={() => setPicking(false)} onPick={add} />}

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

      {editingView && !widget && !picking && (
        <ViewSettingsDrawer
          key={active.id}
          view={active}
          config={config}
          usedBySchedule={usedBySchedule}
          usedBySaver={usedBySaver}
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

      {showTemplates ? (
        <div id="starter-templates" ref={templatesRef} className="scroll-mt-28" tabIndex={-1}>
          <Section title={emptyView ? "Start from a Template" : "Starter Templates"}>
            <p className="text-sm text-soft" role="status">
              {emptyView
                ? "This view is empty — pick a ready-made layout, or add widgets above."
                : "Add a new view from a ready-made layout. Scroll here after tapping Starter templates."}
              {!isPaid ? (
                <>
                  {" "}
                  Free layouts apply straight away; ones marked <HouseholdBadge className="align-middle" /> open{" "}
                  <UpgradeLink reason="template">Household</UpgradeLink> instead.
                </>
              ) : null}
            </p>
            <div className="grid gap-6">
              {templatesByCategory.map((group) => (
                <div key={group.category} className="grid gap-2">
                  <h3 className="text-sm font-semibold text-soft">{group.label}</h3>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {group.templates.map((t) => {
                      const locked = !isPaid && t.tier === "paid";
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className={`card grid gap-2 overflow-hidden p-0 text-left ${locked ? "opacity-55 grayscale-[0.35] hover:opacity-80" : "hover:border-brand"}`}
                          disabled={isPaid && config.views.length >= viewLimit}
                          onClick={() => applyTemplate(t.id)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- static PNG previews in /public/templates */}
                          <img
                            src={t.preview}
                            alt=""
                            width={t.orientation === "portrait" ? 540 : 960}
                            height={t.orientation === "portrait" ? 960 : 540}
                            className={`w-full bg-bg object-cover ${t.orientation === "portrait" ? "aspect-[9/16] max-h-56 justify-self-center" : "aspect-video"}`}
                            loading="lazy"
                          />
                          <span className="grid gap-1 px-3 pb-3">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold">{t.name}</span>
                              {t.orientation === "portrait" ? <span className="text-xs text-soft">Portrait</span> : null}
                              {t.tier === "paid" && <HouseholdBadge />}
                            </span>
                            <span className="text-xs text-soft">{t.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {!emptyView ? (
              <button
                type="button"
                className="btn-ghost justify-self-start text-sm"
                onClick={() => {
                  setTemplatesOpen(false);
                  setNotice("");
                }}
              >
                Hide Templates
              </button>
            ) : null}
          </Section>
        </div>
      ) : null}
    </div>
  );
}
