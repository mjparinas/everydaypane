import "server-only";

import { createHash } from "node:crypto";

import {
  BOARD_H,
  BOARD_W,
  clampStroke,
  ERASE_WIDTH,
  MAX_POINTS_PER_STROKE,
  MAX_STROKES,
  PEN_WIDTH,
  WHITEBOARD_COLOURS,
  type WhiteboardData,
  type WhiteboardStroke,
  type WhiteboardTool,
} from "@/lib/whiteboard";

import { query, run } from "./db";

// One shared kitchen doodle for every display (Melvin, 2026-11-22). Stored as strokes on a fixed board so a wide tile
// and a narrow one show the same drawing. Append-only until someone holds Clear.

type Row = { revision: number | bigint; json: string; updated_at: number | bigint };

const empty = (now: number): WhiteboardData => ({ revision: 1, updatedAt: now, strokes: [] });

function parseStrokes(json: string): WhiteboardStroke[] {
  try {
    const raw = JSON.parse(json) as unknown;
    if (!Array.isArray(raw)) return [];
    const out: WhiteboardStroke[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const s = item as Record<string, unknown>;
      if (typeof s.id !== "string" || s.id.length < 1 || s.id.length > 64) continue;
      const tool: WhiteboardTool = s.tool === "erase" ? "erase" : s.tool === "pen" ? "pen" : null!;
      if (!tool) continue;
      if (typeof s.colour !== "string" || s.colour.length > 20) continue;
      if (!Array.isArray(s.points) || typeof s.width !== "number") continue;
      const points: number[] = [];
      for (const p of s.points) {
        if (typeof p !== "number" || !Number.isFinite(p)) break;
        points.push(Math.round(p));
        if (points.length >= MAX_POINTS_PER_STROKE) break;
      }
      if (points.length < 2 || points.length % 2 !== 0) continue;
      out.push({
        id: s.id,
        tool,
        colour: s.colour,
        points,
        width: Math.max(1, Math.min(80, Math.round(s.width))),
      });
      if (out.length >= MAX_STROKES) break;
    }
    return out;
  } catch {
    return [];
  }
}

async function read(now = Date.now()): Promise<WhiteboardData> {
  const rows = await query<Row>("SELECT revision, json, updated_at FROM whiteboard WHERE id = 1");
  const row = rows[0];
  if (!row) return empty(now);
  return {
    revision: Number(row.revision),
    updatedAt: Number(row.updated_at),
    strokes: parseStrokes(row.json),
  };
}

async function write(data: WhiteboardData): Promise<void> {
  await run(
    "INSERT INTO whiteboard (id, revision, json, updated_at) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, json = excluded.json, updated_at = excluded.updated_at",
    [data.revision, JSON.stringify(data.strokes), data.updatedAt],
  );
}

export async function getWhiteboard(now = Date.now()): Promise<WhiteboardData> {
  return read(now);
}

export function whiteboardTag(data: WhiteboardData): string {
  const body = `${data.revision}:${data.updatedAt}:${data.strokes.map((s) => s.id).join(".")}`;
  return `"wb-${createHash("sha1").update(body).digest("base64url").slice(0, 24)}"`;
}

const COLOUR_SET = new Set<string>(WHITEBOARD_COLOURS);

/** Checks a stroke from the wall before it is stored. */
export function sanitizeStroke(input: unknown): WhiteboardStroke | null {
  if (!input || typeof input !== "object") return null;
  const s = input as Record<string, unknown>;
  if (typeof s.id !== "string" || s.id.length < 4 || s.id.length > 64) return null;
  if (s.tool !== "pen" && s.tool !== "erase") return null;
  if (typeof s.colour !== "string") return null;
  if (s.tool === "pen" && !COLOUR_SET.has(s.colour)) return null;
  if (!Array.isArray(s.points) || s.points.length < 2 || s.points.length > MAX_POINTS_PER_STROKE) return null;
  if (s.points.length % 2 !== 0) return null;
  const points: number[] = [];
  for (let i = 0; i < s.points.length; i += 2) {
    const x = s.points[i];
    const y = s.points[i + 1];
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < -1 || y < -1 || x > BOARD_W + 1 || y > BOARD_H + 1) return null;
    points.push(Math.max(0, Math.min(BOARD_W, Math.round(x))), Math.max(0, Math.min(BOARD_H, Math.round(y))));
  }
  const width =
    typeof s.width === "number" && Number.isFinite(s.width)
      ? Math.max(1, Math.min(80, Math.round(s.width)))
      : s.tool === "erase"
        ? ERASE_WIDTH
        : PEN_WIDTH;
  return clampStroke({
    id: s.id,
    tool: s.tool,
    colour: s.tool === "erase" ? "#000000" : s.colour,
    points,
    width,
  });
}

/**
 * Appends a stroke when the client's revision still matches. A clear on another screen makes the revision move, and
 * the wall reloads instead of scribbling on a wiped board.
 */
export async function appendStroke(
  revision: number,
  stroke: WhiteboardStroke,
  now = Date.now(),
): Promise<{ ok: true; data: WhiteboardData } | { ok: false; reason: "stale" | "duplicate"; data: WhiteboardData }> {
  const current = await read(now);
  if (revision !== current.revision) return { ok: false, reason: "stale", data: current };
  if (current.strokes.some((s) => s.id === stroke.id)) return { ok: false, reason: "duplicate", data: current };
  const strokes = [...current.strokes, stroke];
  while (strokes.length > MAX_STROKES) strokes.shift();
  const data: WhiteboardData = { revision: current.revision, updatedAt: now, strokes };
  await write(data);
  return { ok: true, data };
}

/** Wipes the board when the client's revision matches (hold-to-clear on the wall). */
export async function clearWhiteboard(
  revision: number,
  now = Date.now(),
): Promise<{ ok: true; data: WhiteboardData } | { ok: false; reason: "stale"; data: WhiteboardData }> {
  const current = await read(now);
  if (revision !== current.revision) return { ok: false, reason: "stale", data: current };
  const data: WhiteboardData = { revision: current.revision + 1, updatedAt: now, strokes: [] };
  await write(data);
  return { ok: true, data };
}
