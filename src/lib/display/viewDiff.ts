import { stackOrder } from "@/lib/config/grid";
import type { View, Widget } from "@/lib/config/schema";

// Pure diff of two view layouts for the admin draft preview (Melvin, 2026-11-22): move cells with CSS, remount only
// when a widget's options or type change, so the live editor doesn't flash the whole stage on every edit.

export type PlacedWidget = { widget: Widget; onPhoto: boolean; transparent: boolean };

export type WidgetOp =
  | { op: "add"; placed: PlacedWidget }
  | { op: "remove"; id: string }
  | { op: "move"; id: string; placed: PlacedWidget }
  | { op: "replace"; id: string; placed: PlacedWidget };

/** Stage grid CSS shared by the wall and the draft patcher. */
export function stageGridStyle(view: Pick<View, "cols" | "rows" | "gap" | "padding" | "tilePadding">): string {
  return `grid-template-columns:repeat(${view.cols},minmax(0,1fr));grid-template-rows:repeat(${view.rows},minmax(0,1fr));gap:${view.gap}px;padding:${view.padding}px;--cell-pad:${view.tilePadding}px`;
}

/** Options fingerprint: everything except grid placement. */
export function widgetOptionsKey(w: Widget): string {
  const rest = { ...w };
  delete (rest as { x?: number }).x;
  delete (rest as { y?: number }).y;
  delete (rest as { w?: number }).w;
  delete (rest as { h?: number }).h;
  return JSON.stringify(rest);
}

function placed(w: Widget, onPhoto: boolean): PlacedWidget {
  const transparent = w.type === "sunTimes" && w.transparent;
  return { widget: w, onPhoto, transparent };
}

export function placeWidgets(widgets: Widget[]): PlacedWidget[] {
  return stackOrder(widgets).map(({ widget, onPhoto }) => placed(widget, onPhoto));
}

/**
 * Diff two widget lists after stacking. Callers apply `move` without remounting, `replace`/`add` with a remount,
 * and `remove` with cleanup. Order of ops: removes first, then replaces/moves, then adds (DOM order still fixed by
 * the caller when rebuilding is needed).
 */
export function diffWidgets(prev: Widget[], next: Widget[]): WidgetOp[] {
  const prevPlaced = placeWidgets(prev);
  const nextPlaced = placeWidgets(next);
  const prevById = new Map(prevPlaced.map((p) => [p.widget.id, p]));
  const nextById = new Map(nextPlaced.map((p) => [p.widget.id, p]));
  const ops: WidgetOp[] = [];

  for (const id of prevById.keys()) {
    if (!nextById.has(id)) ops.push({ op: "remove", id });
  }

  for (const nextP of nextPlaced) {
    const id = nextP.widget.id;
    const prevP = prevById.get(id);
    if (!prevP) {
      ops.push({ op: "add", placed: nextP });
      continue;
    }
    const sameOptions = widgetOptionsKey(prevP.widget) === widgetOptionsKey(nextP.widget);
    const sameRect =
      prevP.widget.x === nextP.widget.x &&
      prevP.widget.y === nextP.widget.y &&
      prevP.widget.w === nextP.widget.w &&
      prevP.widget.h === nextP.widget.h;
    const sameStack = prevP.onPhoto === nextP.onPhoto && prevP.transparent === nextP.transparent;
    if (!sameOptions) ops.push({ op: "replace", id, placed: nextP });
    else if (!sameRect || !sameStack) ops.push({ op: "move", id, placed: nextP });
  }

  return ops;
}

export function sameStageGrid(
  a: Pick<View, "cols" | "rows" | "gap" | "padding" | "tilePadding">,
  b: Pick<View, "cols" | "rows" | "gap" | "padding" | "tilePadding">,
): boolean {
  return a.cols === b.cols && a.rows === b.rows && a.gap === b.gap && a.padding === b.padding && a.tilePadding === b.tilePadding;
}
