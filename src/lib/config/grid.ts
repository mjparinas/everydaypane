// Grid arithmetic for the admin panel's drag-and-drop editor. Pure functions on cell rectangles, so they're easy to
// test and shared by the editor and the "add widget" picker. Widgets never run off the grid (the schema refuses a
// layout that runs off it) and never overlap, with one exception: other widgets may sit on top of a photos widget, so
// photos can be the backdrop behind a clock or the weather (Melvin, 2026-11-21: "allow other widgets to be placed on
// top of the photos widget"). Two photos widgets still never overlap, and neither do two widgets drawn over them.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** A widget's type, when the rectangle is a widget: photos widgets are a backdrop layer (see `collides`). */
  type?: string;
}

/** Just the cells a rectangle covers, as the editor's moves and the free-spot search return them. */
export type Cells = Omit<Rect, "type">;

export interface Grid {
  cols: number;
  rows: number;
}

export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Widget types drawn underneath the others, which other widgets may cover. */
export const isBackdrop = (r: { type?: string }) => r.type === "photos";

/** Whether two widgets may not share cells: they overlap and sit on the same layer. */
export const collides = (a: Rect, b: Rect) => isBackdrop(a) === isBackdrop(b) && overlaps(a, b);

/**
 * The order a display draws a view's widgets in: photos first (underneath), then the rest, each marked when it sits on
 * top of a photos widget so the display can keep it readable over the picture.
 */
export function stackOrder<T extends Rect>(widgets: T[]): { widget: T; onPhoto: boolean }[] {
  const backdrops = widgets.filter(isBackdrop);
  return [
    ...backdrops.map((widget) => ({ widget, onPhoto: false })),
    ...widgets.filter((w) => !isBackdrop(w)).map((widget) => ({ widget, onPhoto: backdrops.some((b) => overlaps(widget, b)) })),
  ];
}

/** Keeps a rectangle inside the grid: it shrinks to fit first, then slides back in. */
export function clampRect(r: Rect, grid: Grid, min: { w: number; h: number } = { w: 1, h: 1 }): Cells {
  const w = Math.max(Math.min(min.w, grid.cols), Math.min(Math.round(r.w), grid.cols));
  const h = Math.max(Math.min(min.h, grid.rows), Math.min(Math.round(r.h), grid.rows));
  const x = Math.min(Math.max(0, Math.round(r.x)), grid.cols - w);
  const y = Math.min(Math.max(0, Math.round(r.y)), grid.rows - h);
  return { x, y, w, h };
}

/**
 * Whether `r` fits on the grid without colliding with any of `others` (the widget being moved is left out by the
 * caller). A widget may cover a photos widget, and a photos widget may slide under other widgets (`collides`).
 */
export function fits(r: Rect, grid: Grid, others: Rect[]): boolean {
  if (r.x < 0 || r.y < 0 || r.x + r.w > grid.cols || r.y + r.h > grid.rows) return false;
  return !others.some((o) => collides(r, o));
}

/**
 * The first free spot for a widget of this size, reading left to right and top to bottom; smaller if nothing fits.
 * Empty cells come first: a new widget lands on top of photos only when there's no room for it anywhere else.
 */
export function findSpot(size: { w: number; h: number; type?: string }, grid: Grid, others: Rect[], min = { w: 1, h: 1 }): Cells | null {
  const search = (blocking: Rect[]): Cells | null => {
    for (let h = Math.min(size.h, grid.rows); h >= Math.min(min.h, grid.rows); h--) {
      for (let w = Math.min(size.w, grid.cols); w >= Math.min(min.w, grid.cols); w--) {
        for (let y = 0; y + h <= grid.rows; y++) {
          for (let x = 0; x + w <= grid.cols; x++) {
            const r = { x, y, w, h };
            if (fits({ ...r, type: size.type }, grid, blocking)) return r;
          }
        }
      }
    }
    return null;
  };
  // Pretending every widget is on the same layer keeps the first pass to truly empty cells.
  return search(others.map((o) => ({ ...o, type: size.type }))) ?? search(others);
}

/** A widget's corners, which the editor's resize handles sit on. */
export type Corner = "nw" | "ne" | "sw" | "se";
export const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];

/**
 * The rectangle after dragging one of its corners to `cell` (Melvin, 2026-11-21: "allow any corner of a widget to
 * adjust the size"). The opposite corner stays where it is, the widget never gets smaller than `min`, and it never
 * leaves the grid; whether the new size collides with other widgets is left to `fits`.
 */
export function resizeFrom(r: Cells, corner: Corner, cell: { x: number; y: number }, grid: Grid, min = { w: 1, h: 1 }): Cells {
  const minW = Math.min(min.w, grid.cols);
  const minH = Math.min(min.h, grid.rows);
  const right = r.x + r.w - 1;
  const bottom = r.y + r.h - 1;
  const [left, newRight] = corner.endsWith("w")
    ? [Math.max(0, Math.min(cell.x, right - minW + 1)), right]
    : [r.x, Math.min(grid.cols - 1, Math.max(cell.x, r.x + minW - 1))];
  const [top, newBottom] = corner.startsWith("n")
    ? [Math.max(0, Math.min(cell.y, bottom - minH + 1)), bottom]
    : [r.y, Math.min(grid.rows - 1, Math.max(cell.y, r.y + minH - 1))];
  return { x: left, y: top, w: newRight - left + 1, h: newBottom - top + 1 };
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
    if (fits({ ...clamped, type: w.type }, grid, kept)) {
      kept.push({ ...w, ...clamped });
      continue;
    }
    const spot = findSpot({ ...clamped, type: w.type }, grid, kept);
    if (spot) kept.push({ ...w, ...spot });
    else dropped.push(w);
  }
  return { kept, dropped };
}
