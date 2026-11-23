// Shared kitchen whiteboard (Melvin, 2026-11-22): a few colours, finger draw, eraser, hold to clear.
// Every display shows the same doodle. Coordinates are on a fixed board so different tile sizes stay lined up.

/** Logical board size. Widgets letterbox this into their cell. */
export const BOARD_W = 1600;
export const BOARD_H = 900;

/** Colours on the toolbar, shown left to right. Wider tiles uncover more of the list. */
export const WHITEBOARD_COLOURS = ["#111111", "#e11d48", "#2563eb", "#16a34a", "#ea580c", "#7c3aed", "#db2777", "#0d9488"] as const;

export type WhiteboardColour = (typeof WHITEBOARD_COLOURS)[number];

export type WhiteboardTool = "pen" | "erase";

export interface WhiteboardStroke {
  id: string;
  tool: WhiteboardTool;
  /** Pen colour; ignored when erasing. */
  colour: string;
  /** Packed board coordinates [x0, y0, x1, y1, …], integers. */
  points: number[];
  /** Stroke width in board pixels. */
  width: number;
}

export interface WhiteboardData {
  /** Bumps when the board is cleared, so every display drops the old doodle. */
  revision: number;
  updatedAt: number;
  strokes: WhiteboardStroke[];
}

export const PEN_WIDTH = 10;
export const ERASE_WIDTH = 36;
/** How long to hold Clear before the board wipes (ms). */
export const CLEAR_HOLD_MS = 800;

export const MAX_STROKES = 400;
export const MAX_POINTS_PER_STROKE = 250;
/** Skip points closer than this (board pixels) while drawing, so a stroke stays small. */
export const MIN_POINT_GAP = 3;

/**
 * How many colours fit on the toolbar for a tile this wide in pixels.
 * Eraser and Clear always take a slot; a narrow tile still gets at least three colours.
 */
export function colourCountForWidth(px: number): number {
  const forTools = 120;
  const swatch = 48;
  const n = Math.floor((Math.max(0, px) - forTools) / swatch);
  return Math.max(3, Math.min(WHITEBOARD_COLOURS.length, n));
}

export function coloursForWidth(px: number): readonly string[] {
  return WHITEBOARD_COLOURS.slice(0, colourCountForWidth(px));
}

/** Whether a new point is far enough from the last one to keep. */
export function shouldAddPoint(points: readonly number[], x: number, y: number, minDist = MIN_POINT_GAP): boolean {
  if (points.length < 2) return true;
  const lx = points[points.length - 2]!;
  const ly = points[points.length - 1]!;
  const dx = x - lx;
  const dy = y - ly;
  return dx * dx + dy * dy >= minDist * minDist;
}

/** Clamp and round a pointer position onto the board. */
export function boardPoint(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(BOARD_W, Math.round(x))),
    y: Math.max(0, Math.min(BOARD_H, Math.round(y))),
  };
}

/**
 * Maps a pointer through a letterboxed board inside an element (object-fit: contain of BOARD_W × BOARD_H).
 * `rect` is the element's getBoundingClientRect().
 */
export function pointerToBoard(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const scale = Math.min(rect.width / BOARD_W, rect.height / BOARD_H);
  const drawW = BOARD_W * scale;
  const drawH = BOARD_H * scale;
  const left = rect.left + (rect.width - drawW) / 2;
  const top = rect.top + (rect.height - drawH) / 2;
  const x = (clientX - left) / scale;
  const y = (clientY - top) / scale;
  if (x < -20 || y < -20 || x > BOARD_W + 20 || y > BOARD_H + 20) return null;
  return boardPoint(x, y);
}

/** Trim a stroke so the server never stores a runaway scribble. */
export function clampStroke(stroke: WhiteboardStroke): WhiteboardStroke {
  const points = stroke.points.slice(0, MAX_POINTS_PER_STROKE - (MAX_POINTS_PER_STROKE % 2));
  if (points.length % 2 === 1) points.pop();
  return { ...stroke, points };
}
