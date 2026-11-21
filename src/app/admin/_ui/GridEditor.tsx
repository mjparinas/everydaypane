"use client";

import { useRef, useState } from "react";

import { cellAt, clampRect, fits, isBackdrop, type Rect } from "@/lib/config/grid";
import type { View, Widget } from "@/lib/config/schema";
import { WIDGETS } from "@/lib/config/widgets";

// The drag-and-drop layout editor (Melvin, 2026-11-17: a grid with a chosen number of rows and columns). Drag a widget
// to move it, drag its corner to resize it, tap it to edit its settings. Works with a mouse, a finger (pointer events)
// and the keyboard (arrows move, Shift + arrows resize). A move or resize that would overlap another widget or leave
// the grid is shown in red and not applied. Photos widgets are the exception (Melvin, 2026-11-21): they're drawn
// underneath, and other widgets can be dropped on top of them.

type Drag = { id: string; mode: "move" | "resize"; offset: { x: number; y: number }; pointer: number; moved: boolean; rect: Rect };

export function GridEditor({
  view,
  selectedId,
  onSelect,
  onChange,
}: {
  view: View;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, rect: Rect) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const grid = { cols: view.cols, rows: view.rows };
  // The editor is drawn smaller than the real screen, so the gap shrinks in proportion (1920 px wide on the display).
  const gapPx = (width: number) => (view.gap * width) / 1920;

  const others = (id: string) => view.widgets.filter((w) => w.id !== id);
  const minOf = (w: Widget) => WIDGETS[w.type].minSize;

  function cellFromEvent(e: React.PointerEvent): { x: number; y: number } {
    const el = box.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return cellAt(e.clientX - r.left, e.clientY - r.top, { width: r.width, height: r.height }, grid, gapPx(r.width));
  }

  function start(e: React.PointerEvent, w: Widget, mode: Drag["mode"]) {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const c = cellFromEvent(e);
    setDrag({
      id: w.id,
      mode,
      offset: { x: c.x - w.x, y: c.y - w.y },
      pointer: e.pointerId,
      moved: false,
      rect: { x: w.x, y: w.y, w: w.w, h: w.h },
    });
  }

  function move(e: React.PointerEvent, w: Widget) {
    if (!drag || drag.pointer !== e.pointerId || drag.id !== w.id) return;
    const c = cellFromEvent(e);
    const rect =
      drag.mode === "move"
        ? clampRect({ x: c.x - drag.offset.x, y: c.y - drag.offset.y, w: w.w, h: w.h }, grid)
        : clampRect({ x: w.x, y: w.y, w: c.x - w.x + 1, h: c.y - w.y + 1 }, grid, minOf(w));
    if (rect.x !== drag.rect.x || rect.y !== drag.rect.y || rect.w !== drag.rect.w || rect.h !== drag.rect.h) {
      setDrag({ ...drag, rect, moved: true });
    }
  }

  function end(e: React.PointerEvent, w: Widget) {
    if (!drag || drag.pointer !== e.pointerId) return;
    if (!drag.moved) onSelect(w.id);
    else if (fits({ ...drag.rect, type: w.type }, grid, others(w.id))) onChange(w.id, drag.rect);
    setDrag(null);
  }

  function key(e: React.KeyboardEvent, w: Widget) {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(w.id);
      }
      return;
    }
    e.preventDefault();
    const [dx = 0, dy = 0] = d;
    const next = e.shiftKey ? { x: w.x, y: w.y, w: w.w + dx, h: w.h + dy } : { x: w.x + dx, y: w.y + dy, w: w.w, h: w.h };
    const min = minOf(w);
    if (next.w < min.w || next.h < min.h) return;
    if (fits({ ...next, type: w.type }, grid, others(w.id))) onChange(w.id, next);
  }

  const cells = [];
  for (let y = 0; y < view.rows; y++)
    for (let x = 0; x < view.cols; x++)
      cells.push(
        <div key={`${x}-${y}`} className="rounded-md border border-dashed border-line" style={{ gridColumn: x + 1, gridRow: y + 1 }} />,
      );

  return (
    <div
      ref={box}
      className="relative grid aspect-video w-full touch-pan-y rounded-2xl bg-bg p-0 select-none"
      style={{
        gridTemplateColumns: `repeat(${view.cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${view.rows}, minmax(0, 1fr))`,
        gap: `calc(${view.gap} / 1920 * 100cqw)`,
        containerType: "inline-size",
      }}
      onPointerDown={() => onSelect(null)}
      data-testid="grid-editor"
    >
      {cells}
      {view.widgets.map((w) => {
        const dragging = drag?.id === w.id && drag.moved;
        const r = dragging ? drag.rect : w;
        const ok = !dragging || fits({ ...drag.rect, type: w.type }, grid, others(w.id));
        const backdrop = isBackdrop(w);
        const info = WIDGETS[w.type];
        const selected = selectedId === w.id;
        return (
          <div
            key={w.id}
            role="button"
            tabIndex={0}
            aria-label={`${w.title || info.label}, ${w.w} by ${w.h} at column ${w.x + 1}, row ${w.y + 1}`}
            aria-pressed={selected}
            data-widget={w.id}
            className={`relative flex min-w-0 cursor-grab touch-none flex-col overflow-hidden rounded-lg border-2 p-1 shadow-sm transition-[box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-brand/50 active:cursor-grabbing ${
              backdrop ? "items-start justify-start bg-line/60 text-left" : "items-center justify-center bg-panel text-center"
            } ${dragging ? "z-10" : backdrop ? "z-0" : "z-[1]"} ${dragging && !ok ? "border-bad opacity-80" : selected ? "border-brand" : "border-line"} ${
              dragging && ok ? "opacity-90 shadow-lg" : ""
            }`}
            style={{ gridColumn: `${r.x + 1} / span ${r.w}`, gridRow: `${r.y + 1} / span ${r.h}` }}
            onPointerDown={(e) => start(e, w, "move")}
            onPointerMove={(e) => move(e, w)}
            onPointerUp={(e) => end(e, w)}
            onPointerCancel={() => setDrag(null)}
            onKeyDown={(e) => key(e, w)}
          >
            <span className="text-xl leading-none" aria-hidden="true">
              {info.icon}
            </span>
            <span className="mt-1 w-full truncate text-xs font-medium">{w.title || widgetName(w)}</span>
            <span
              aria-hidden="true"
              className="absolute right-0 bottom-0 h-6 w-6 cursor-nwse-resize touch-none rounded-tl-md bg-line/80 after:absolute after:right-1 after:bottom-1 after:h-2 after:w-2 after:border-r-2 after:border-b-2 after:border-soft"
              onPointerDown={(e) => start(e, w, "resize")}
              onPointerMove={(e) => move(e, w)}
              onPointerUp={(e) => end(e, w)}
            />
          </div>
        );
      })}
    </div>
  );
}

/** A widget's name in lists: its title, or what it shows ("Clock · Toronto"). */
export function widgetName(w: Widget): string {
  const base = WIDGETS[w.type].label;
  if (w.title) return w.title;
  if (w.type === "clock" && w.label) return `${base} · ${w.label}`;
  if (w.type === "note" && w.text) return `${base} · ${w.text.slice(0, 20)}`;
  return base;
}
