// Grid arithmetic for the admin panel's drag-and-drop editor. Pure functions on cell rectangles, so they're easy to
// test and shared by the editor and the "add widget" picker. Widgets never overlap and never run off the grid (the
// schema refuses a layout that runs off it).

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Grid {
  cols: number;
  rows: number;
}

export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Keeps a rectangle inside the grid: it shrinks to fit first, then slides back in. */
export function clampRect(r: Rect, grid: Grid, min: { w: number; h: number } = { w: 1, h: 1 }): Rect {
  const w = Math.max(Math.min(min.w, grid.cols), Math.min(Math.round(r.w), grid.cols));
  const h = Math.max(Math.min(min.h, grid.rows), Math.min(Math.round(r.h), grid.rows));
  const x = Math.min(Math.max(0, Math.round(r.x)), grid.cols - w);
  const y = Math.min(Math.max(0, Math.round(r.y)), grid.rows - h);
  return { x, y, w, h };
}

/** Whether `r` fits on the grid without touching any of `others` (the widget being moved is left out by the caller). */
export function fits(r: Rect, grid: Grid, others: Rect[]): boolean {
  if (r.x < 0 || r.y < 0 || r.x + r.w > grid.cols || r.y + r.h > grid.rows) return false;
  return !others.some((o) => overlaps(r, o));
}

/** The first free spot for a widget of this size, reading left to right and top to bottom; smaller if nothing fits. */
export function findSpot(size: { w: number; h: number }, grid: Grid, others: Rect[], min = { w: 1, h: 1 }): Rect | null {
  for (let h = Math.min(size.h, grid.rows); h >= Math.min(min.h, grid.rows); h--) {
    for (let w = Math.min(size.w, grid.cols); w >= Math.min(min.w, grid.cols); w--) {
      for (let y = 0; y + h <= grid.rows; y++) {
        for (let x = 0; x + w <= grid.cols; x++) {
          const r = { x, y, w, h };
          if (fits(r, grid, others)) return r;
        }
      }
    }
  }
  return null;
}

/** The cell under a point, for a grid drawn in a box of this size with this gap between cells. */
export function cellAt(px: number, py: number, box: { width: number; height: number }, grid: Grid, gap: number): { x: number; y: number } {
  const cw = (box.width - gap * (grid.cols - 1)) / grid.cols;
  const ch = (box.height - gap * (grid.rows - 1)) / grid.rows;
  return {
    x: Math.min(grid.cols - 1, Math.max(0, Math.floor(px / (cw + gap)))),
    y: Math.min(grid.rows - 1, Math.max(0, Math.floor(py / (ch + gap)))),
  };
}

/**
 * Fits every widget onto a resized grid: widgets that still fit stay put, the rest are clamped and then moved to the
 * first free spot. Widgets with no room left are returned in `dropped` so the editor can say which ones.
 */
export function refit<T extends Rect & { id: string }>(widgets: T[], grid: Grid): { kept: T[]; dropped: T[] } {
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const w of widgets) {
    const clamped = clampRect(w, grid);
    if (fits(clamped, grid, kept)) {
      kept.push({ ...w, ...clamped });
      continue;
    }
    const spot = findSpot(clamped, grid, kept);
    if (spot) kept.push({ ...w, ...spot });
    else dropped.push(w);
  }
  return { kept, dropped };
}
