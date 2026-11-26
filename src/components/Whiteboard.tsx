"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { familyAuthError, useFamilyAuth, useFamilyFetch } from "@/components/FamilyAuth";
import {
  BOARD_H,
  BOARD_W,
  CLEAR_HOLD_MS,
  ERASE_WIDTH,
  PEN_WIDTH,
  pointerToBoard,
  shouldAddPoint,
  WHITEBOARD_COLOURS,
  type WhiteboardData,
  type WhiteboardStroke,
  type WhiteboardTool,
} from "@/lib/whiteboard";

// The household's whiteboard on a phone (Melvin, 2026-11-26: "let the whiteboard sync from phones"). Same board,
// strokes and hold-to-clear as the wall's widget (src/display/widgets/whiteboard.ts), drawn on the same 1600 × 900
// board so a doodle lines up everywhere. Used by /family/ and `/d/<token>/edit/`.

const POLL_MS = 3_000;

function strokeId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: WhiteboardStroke) {
  const pts = stroke.points;
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = stroke.width;
  ctx.globalCompositeOperation = stroke.tool === "erase" ? "destination-out" : "source-over";
  ctx.strokeStyle = stroke.tool === "erase" ? "#000" : stroke.colour;
  ctx.beginPath();
  ctx.moveTo(pts[0]!, pts[1]!);
  if (pts.length === 2) ctx.lineTo(pts[0]! + 0.01, pts[1]!);
  else for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
  ctx.stroke();
  ctx.restore();
}

export function Whiteboard() {
  const familyFetch = useFamilyFetch();
  const { displayToken } = useFamilyAuth();
  const viaDisplay = Boolean(displayToken);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const board = useRef<WhiteboardData>({ revision: 1, updatedAt: 0, strokes: [] });
  const drawing = useRef<WhiteboardStroke | null>(null);
  const pointer = useRef<number | null>(null);
  const etag = useRef<string>("");
  const [tool, setTool] = useState<WhiteboardTool>("pen");
  const [colour, setColour] = useState<string>(WHITEBOARD_COLOURS[0]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef<number | undefined>(undefined);

  const paint = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, BOARD_W, BOARD_H);
    for (const s of board.current.strokes) drawStroke(ctx, s);
    if (drawing.current) drawStroke(ctx, drawing.current);
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await familyFetch("/api/whiteboard/", { headers: etag.current ? { "if-none-match": etag.current } : {} });
      if (r.status === 304) return;
      if (!r.ok) return setError(familyAuthError(r.status, viaDisplay, "Couldn't load the whiteboard."));
      etag.current = r.headers.get("etag") ?? "";
      board.current = (await r.json()) as WhiteboardData;
      setError("");
      setLoaded(true);
      paint();
    } catch {
      setError("No connection.");
    }
    // familyFetch is a new function each render; the token it closes over never changes on a page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paint, viaDisplay]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && pointer.current === null) void load();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  async function send(body: unknown) {
    try {
      const r = await familyFetch("/api/whiteboard/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.status === 429) setError("That's a lot of drawing. Try again later.");
      else if (!r.ok && r.status !== 409) setError(familyAuthError(r.status, viaDisplay, "Couldn't save that."));
    } catch {
      setError("No connection.");
    }
    // Stale or refused: reading the board again restores what everyone else sees.
    etag.current = "";
    await load();
  }

  function onDown(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (pointer.current !== null || !loaded) return;
    const p = pointerToBoard(ev.currentTarget.getBoundingClientRect(), ev.clientX, ev.clientY);
    if (!p) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    pointer.current = ev.pointerId;
    drawing.current = {
      id: strokeId(),
      tool,
      colour: tool === "erase" ? "#000000" : colour,
      points: [p.x, p.y],
      width: tool === "erase" ? ERASE_WIDTH : PEN_WIDTH,
    };
    paint();
  }

  function onMove(ev: React.PointerEvent<HTMLCanvasElement>) {
    const stroke = drawing.current;
    if (!stroke || ev.pointerId !== pointer.current) return;
    const p = pointerToBoard(ev.currentTarget.getBoundingClientRect(), ev.clientX, ev.clientY);
    if (!p || !shouldAddPoint(stroke.points, p.x, p.y)) return;
    stroke.points.push(p.x, p.y);
    paint();
    // A very long scribble is cut into strokes the server will take.
    if (stroke.points.length >= 240) {
      finish();
      drawing.current = { ...stroke, id: strokeId(), points: [p.x, p.y] };
      pointer.current = ev.pointerId;
    }
  }

  function finish() {
    const stroke = drawing.current;
    drawing.current = null;
    pointer.current = null;
    if (!stroke || stroke.points.length < 2) return;
    board.current = { ...board.current, strokes: [...board.current.strokes, stroke], updatedAt: Date.now() };
    paint();
    void send({ op: "stroke", revision: board.current.revision, stroke });
  }

  function startHold() {
    window.clearTimeout(holdTimer.current);
    setHolding(true);
    holdTimer.current = window.setTimeout(() => {
      setHolding(false);
      const revision = board.current.revision;
      board.current = { revision: revision + 1, updatedAt: Date.now(), strokes: [] };
      paint();
      void send({ op: "clear", revision });
    }, CLEAR_HOLD_MS);
  }

  function stopHold() {
    window.clearTimeout(holdTimer.current);
    setHolding(false);
  }

  return (
    <div className="grid gap-2">
      <canvas
        ref={canvasRef}
        width={BOARD_W}
        height={BOARD_H}
        aria-label="Whiteboard"
        className="block w-full rounded-xl border border-line bg-white"
        style={{ aspectRatio: `${BOARD_W} / ${BOARD_H}`, touchAction: "none" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Whiteboard tools">
        {WHITEBOARD_COLOURS.map((c) => {
          const on = tool === "pen" && colour === c;
          return (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={on}
              onClick={() => {
                setTool("pen");
                setColour(c);
              }}
              className={`h-9 w-9 rounded-full border-2 ${on ? "border-ink ring-2 ring-brand" : "border-white shadow"}`}
              style={{ background: c }}
            />
          );
        })}
        <button
          type="button"
          aria-pressed={tool === "erase"}
          onClick={() => setTool("erase")}
          className={tool === "erase" ? "btn" : "btn-ghost"}
        >
          Eraser
        </button>
        <button
          type="button"
          className="btn-ghost relative overflow-hidden"
          onPointerDown={startHold}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Hold to clear"
        >
          <span
            aria-hidden="true"
            className="absolute inset-0 origin-left bg-bad/20"
            style={{ transform: `scaleX(${holding ? 1 : 0})`, transition: holding ? `transform ${CLEAR_HOLD_MS}ms linear` : "none" }}
          />
          <span className="relative">Hold to clear</span>
        </button>
      </div>
      <p className="text-sm text-soft" role="status">
        {error || "Draw here and it shows on every wall screen with a whiteboard."}
      </p>
    </div>
  );
}
