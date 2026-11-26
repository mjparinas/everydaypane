"use client";

import { useEffect, useRef, useState } from "react";

import { cellAt, clampRect, CORNERS, fits, isBackdrop, overlaps, resizeFrom, type Corner, type Rect } from "@/lib/config/grid";
import type { DashboardConfig, View, Widget } from "@/lib/config/schema";
import { WIDGETS } from "@/lib/config/widgets";
import { clearDraftMessage, draftMessage, parsePreviewLayout, parsePreviewReady } from "@/lib/display/draftMessage";
import { displayPayload } from "@/lib/display/payload";

// One editable live surface (Melvin, 2026-11-22): the real display in an iframe, with a transparent drag overlay on
// top so layout and widget options update in place — no separate schematic grid. Remount with key={viewId} when the
// active view changes. Wall displays still only see the saved document.

const DESIGN_W = 1920;
const DESIGN_H = 1080;
/** Reused by "Open full preview" so switching views navigates the same tab instead of leaving a stale one. */
const FULL_PREVIEW = "everydaypane-preview";

type Drag = {
  id: string;
  mode: "move" | Corner;
  offset: { x: number; y: number };
  origin: { x: number; y: number };
  pointer: number;
  moved: boolean;
  rect: Rect;
};

/** Last full-preview tab opened from the Views editor (module-level so remounts keep the handle). */
let fullPreviewWin: Window | null = null;

export function LiveLayoutEditor({
  view,
  viewId,
  config,
  version,
  selectedId,
  onSelect,
  onChange,
}: {
  view: View;
  viewId: string;
  config: DashboardConfig;
  version: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, rect: Rect) => void;
}) {
  const shell = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0.5);
  const [listening, setListening] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [stageRect, setStageRect] = useState({ left: 0, top: 0, width: DESIGN_W, height: DESIGN_H });
  const draftTimer = useRef<number | undefined>(undefined);
  const latest = useRef({ config, version, viewId });

  const src = `/household/preview/${encodeURIComponent(viewId)}/?mode=day`;
  const grid = { cols: view.cols, rows: view.rows };
  const gapPx = (width: number) => (view.gap * width) / DESIGN_W;

  const others = (id: string) => view.widgets.filter((w) => w.id !== id);
  const minOf = (w: Widget) => WIDGETS[w.type].minSize;

  useEffect(() => {
    const el = shell.current;
    if (!el) return;
    const measure = () => setScale(Math.max(0.1, el.clientWidth / DESIGN_W));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    latest.current = { config, version, viewId };
  }, [config, version, viewId]);

  function sendDraft(win: Window) {
    const { config: c, version: v, viewId: id } = latest.current;
    try {
      win.postMessage(draftMessage(displayPayload(c, v, null, id)), window.location.origin);
    } catch {
      // Frame navigated away mid-send.
    }
  }

  useEffect(() => {
    const hasFull = Boolean(fullPreviewWin && !fullPreviewWin.closed);
    if (!listening && !hasFull) return;
    window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      const frameWin = frame.current?.contentWindow;
      if (listening && frameWin) sendDraft(frameWin);
      const full = fullPreviewWin;
      if (full && !full.closed) {
        try {
          // Only push when that tab is still on this view (pathname carries the view id).
          if (full.location.pathname.includes(`/household/preview/${encodeURIComponent(latest.current.viewId)}`)) {
            sendDraft(full);
          }
        } catch {
          // Tab on another origin or gone.
          fullPreviewWin = null;
        }
      }
    }, 120);
    return () => window.clearTimeout(draftTimer.current);
  }, [config, version, viewId, listening]);

  useEffect(() => {
    const iframe = frame.current;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const layout = parsePreviewLayout(event.data);
      if (layout && event.source === iframe?.contentWindow) {
        setStageRect(layout.rect);
        return;
      }
      if (!parsePreviewReady(event.data)) return;
      if (event.source === iframe?.contentWindow) {
        setListening(true);
        if (event.source && "postMessage" in event.source) sendDraft(event.source as Window);
        return;
      }
      // Ready ping from the "Open full preview" tab (opener relationship).
      if (event.source && "postMessage" in event.source) {
        fullPreviewWin = event.source as Window;
        sendDraft(event.source as Window);
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      const win = iframe?.contentWindow;
      if (win) {
        try {
          win.postMessage(clearDraftMessage(), window.location.origin);
        } catch {
          // Frame already gone.
        }
      }
    };
  }, [viewId]);

  function openFullPreview(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    // Named target: reuse one tab and navigate it to the active view (target=_blank left a stale first tab).
    // No noreferrer/noopener — we need window.opener so the tab can take the working-copy draft.
    const w = window.open(src, FULL_PREVIEW);
    if (!w) return;
    fullPreviewWin = w;
    w.focus();
  }

  function cellFromEvent(e: React.PointerEvent): { x: number; y: number } {
    const el = overlay.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const shellWidth = shell.current?.clientWidth ?? r.width;
    // Padding matches the display stage; cell math uses the padded content box.
    const pad = (view.padding * shellWidth) / DESIGN_W;
    return cellAt(
      e.clientX - r.left - pad,
      e.clientY - r.top - pad,
      { width: r.width - pad * 2, height: r.height - pad * 2 },
      grid,
      gapPx(shellWidth),
    );
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
      origin: { x: e.clientX, y: e.clientY },
      pointer: e.pointerId,
      moved: false,
      rect: { x: w.x, y: w.y, w: w.w, h: w.h },
    });
  }

  function move(e: React.PointerEvent, w: Widget) {
    if (!drag || drag.pointer !== e.pointerId || drag.id !== w.id) return;
    const c = cellFromEvent(e);
    let resizeCell = c;
    if (drag.mode !== "move") {
      const el = overlay.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const shellWidth = shell.current?.clientWidth ?? r.width;
        const pad = (view.padding * shellWidth) / DESIGN_W;
        const gap = gapPx(shellWidth);
        const cw = (r.width - pad * 2 - gap * (grid.cols - 1)) / grid.cols;
        const ch = (r.height - pad * 2 - gap * (grid.rows - 1)) / grid.rows;
        resizeCell = {
          x: Math.abs(e.clientX - drag.origin.x) < cw / 2 ? (drag.mode.endsWith("w") ? w.x : w.x + w.w - 1) : c.x,
          y: Math.abs(e.clientY - drag.origin.y) < ch / 2 ? (drag.mode.startsWith("n") ? w.y : w.y + w.h - 1) : c.y,
        };
      }
    }
    const rect =
      drag.mode === "move"
        ? clampRect({ x: c.x - drag.offset.x, y: c.y - drag.offset.y, w: w.w, h: w.h }, grid)
        : resizeFrom(w, drag.mode, resizeCell, grid, minOf(w));
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
    const next = !e.shiftKey
      ? { x: w.x + dx, y: w.y + dy, w: w.w, h: w.h }
      : e.altKey
        ? resizeFrom(w, "nw", { x: w.x + dx, y: w.y + dy }, grid, minOf(w))
        : resizeFrom(w, "se", { x: w.x + w.w - 1 + dx, y: w.y + w.h - 1 + dy }, grid, minOf(w));
    if (next.x === w.x && next.y === w.y && next.w === w.w && next.h === w.h) return;
    if (fits({ ...next, type: w.type }, grid, others(w.id))) onChange(w.id, next);
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-soft">Layout</h2>
        <a
          className="btn-ghost min-h-9 px-3 text-sm"
          href={src}
          target={FULL_PREVIEW}
          data-testid="open-full-preview"
          onClick={openFullPreview}
        >
          Open full preview ↗
        </a>
      </div>
      <div
        ref={shell}
        className="relative w-full overflow-hidden rounded-2xl border border-line bg-black"
        style={{ aspectRatio: `${DESIGN_W} / ${DESIGN_H}` }}
        data-testid="live-preview"
      >
        <iframe
          key={viewId}
          ref={frame}
          title="Preview of this view"
          src={src}
          className="absolute top-0 left-0 border-0"
          style={{
            width: DESIGN_W,
            height: DESIGN_H,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            pointerEvents: "none",
          }}
          sandbox="allow-scripts allow-same-origin allow-forms"
        />
        {/* Transparent hit layer: same padding/gap/cols as the display stage so handles sit on the live widgets. */}
        <div
          ref={overlay}
          className="absolute grid touch-pan-y select-none"
          style={{
            gridTemplateColumns: `repeat(${view.cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${view.rows}, minmax(0, 1fr))`,
            left: `${(stageRect.left / DESIGN_W) * 100}%`,
            top: `${(stageRect.top / DESIGN_H) * 100}%`,
            width: `${(stageRect.width / DESIGN_W) * 100}%`,
            height: `${(stageRect.height / DESIGN_H) * 100}%`,
            gap: `${view.gap * scale}px`,
            padding: `${view.padding * scale}px`,
            containerType: "inline-size",
          }}
          onPointerDown={() => onSelect(null)}
          data-testid="grid-editor"
        >
          {view.widgets.map((w) => {
            const dragging = drag?.id === w.id && drag.moved;
            const r = dragging ? drag.rect : w;
            const ok = !dragging || fits({ ...drag.rect, type: w.type }, grid, others(w.id));
            const backdrop = isBackdrop(w);
            const onPhoto =
              !backdrop &&
              view.widgets.some((other) => isBackdrop(other) && overlaps(dragging && drag?.id === w.id ? drag.rect : w, other));
            const info = WIDGETS[w.type];
            const selected = selectedId === w.id;
            return (
              <div
                key={w.id}
                role="button"
                tabIndex={0}
                aria-label={`${w.title || info.label}, ${w.w} by ${w.h} at column ${w.x + 1}, row ${w.y + 1}${onPhoto ? ", on photos" : ""}`}
                aria-pressed={selected}
                data-widget={w.id}
                data-on-photo={onPhoto ? "1" : undefined}
                className={`group relative min-w-0 cursor-grab touch-none rounded-lg border-2 outline-none focus-visible:ring-2 focus-visible:ring-brand/50 active:cursor-grabbing ${
                  dragging ? "z-10" : backdrop ? "z-0" : "z-[1]"
                } ${
                  dragging && !ok
                    ? "border-bad bg-bad/25"
                    : selected
                      ? "border-brand bg-brand/10"
                      : onPhoto
                        ? "border-brand/40 bg-brand/5"
                        : "border-transparent hover:border-brand/50"
                } ${dragging && ok ? "bg-brand/15 shadow-lg" : ""}`}
                style={{ gridColumn: `${r.x + 1} / span ${r.w}`, gridRow: `${r.y + 1} / span ${r.h}` }}
                onPointerDown={(e) => start(e, w, "move")}
                onPointerMove={(e) => move(e, w)}
                onPointerUp={(e) => end(e, w)}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={(e) => key(e, w)}
              >
                {CORNERS.map((corner) => (
                  <span
                    key={corner}
                    aria-hidden="true"
                    data-corner={corner}
                    className={`absolute h-5 w-5 touch-none bg-brand/80 after:absolute after:h-2 after:w-2 after:border-white ${HANDLE[corner]} ${
                      selected || dragging
                        ? ""
                        : corner === "se"
                          ? // Touch screens have no hover, so an always-on handle on every tile buried a phone-sized
                            // preview (Melvin, 2026-11-26); there a tap selects the tile and shows its four handles.
                            "[@media(hover:none)]:hidden"
                          : "hidden group-hover:block group-focus:block"
                    }`}
                    onPointerDown={(e) => start(e, w, corner)}
                    onPointerMove={(e) => move(e, w)}
                    onPointerUp={(e) => end(e, w)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const HANDLE: Record<Corner, string> = {
  nw: "top-0 left-0 cursor-nwse-resize rounded-br-md after:top-1 after:left-1 after:border-t-2 after:border-l-2",
  ne: "top-0 right-0 cursor-nesw-resize rounded-bl-md after:top-1 after:right-1 after:border-t-2 after:border-r-2",
  sw: "bottom-0 left-0 cursor-nesw-resize rounded-tr-md after:bottom-1 after:left-1 after:border-b-2 after:border-l-2",
  se: "right-0 bottom-0 cursor-nwse-resize rounded-tl-md after:right-1 after:bottom-1 after:border-r-2 after:border-b-2",
};

/** A widget's name in lists: its title, or what it shows ("Clock · Toronto"). */
export function widgetName(w: Widget): string {
  const base = WIDGETS[w.type].label;
  if (w.title) return w.title;
  if (w.type === "clock" && w.label) return `${base} · ${w.label}`;
  if (w.type === "note" && w.text) return `${base} · ${w.text.slice(0, 20)}`;
  return base;
}
