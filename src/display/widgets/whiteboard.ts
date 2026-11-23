import {
  BOARD_H,
  BOARD_W,
  CLEAR_HOLD_MS,
  coloursForWidth,
  ERASE_WIDTH,
  PEN_WIDTH,
  pointerToBoard,
  shouldAddPoint,
  type WhiteboardData,
  type WhiteboardStroke,
  type WhiteboardTool,
} from "@/lib/whiteboard";

import { refresh, send, subscribe } from "../api";
import { h } from "../dom";
import type { Mount } from "./types";

// Kitchen whiteboard (Melvin, 2026-11-22): finger draw, a few colours, eraser, hold Clear. The same doodle is on
// every display; wider tiles uncover more colours on the toolbar.

export const WHITEBOARD_EVERY = 3_000;

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
  if (stroke.tool === "erase") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "#000";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = stroke.colour;
  }
  ctx.beginPath();
  ctx.moveTo(pts[0]!, pts[1]!);
  if (pts.length === 2) {
    // A tap still leaves a dot.
    ctx.lineTo(pts[0]! + 0.01, pts[1]!);
  } else {
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
  }
  ctx.stroke();
  ctx.restore();
}

function paintBoard(ctx: CanvasRenderingContext2D, strokes: readonly WhiteboardStroke[]) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, BOARD_W, BOARD_H);
  for (const s of strokes) drawStroke(ctx, s);
}

export const whiteboard: Mount<"whiteboard"> = (el, w) => {
  const canvas = h("canvas", {
    class: "wb-canvas",
    width: String(BOARD_W),
    height: String(BOARD_H),
    "aria-label": "Whiteboard",
  }) as HTMLCanvasElement;
  const coloursEl = h("div", { class: "wb-colours" });
  const clearFill = h("span", { class: "wb-clear-fill", "aria-hidden": "true" });
  const clearBtn = h(
    "button",
    { type: "button", class: "wb-clear", "aria-label": "Hold to clear" },
    clearFill,
    h("span", { class: "wb-clear-label" }, "Clear"),
  ) as HTMLButtonElement;
  const eraseBtn = h(
    "button",
    { type: "button", class: "wb-tool", "aria-label": "Eraser", "aria-pressed": "false" },
    "⌫",
  ) as HTMLButtonElement;
  const bar = h("div", { class: "wb-bar" }, coloursEl, eraseBtn, clearBtn);
  const root = h(
    "div",
    { class: "w-whiteboard" },
    w.title ? h("div", { class: "w-label" }, w.title) : null,
    h("div", { class: "wb-stage" }, canvas),
    bar,
  );
  el.append(root);

  const ctx = canvas.getContext("2d");
  if (!ctx) return () => undefined;

  let board: WhiteboardData = { revision: 1, updatedAt: 0, strokes: [] };
  let tool: WhiteboardTool = "pen";
  let colour = coloursForWidth(200)[0] ?? "#111111";
  let drawing: WhiteboardStroke | null = null;
  let pointerId: number | null = null;
  let clearTimer: number | undefined;
  let clearStarted = 0;
  let colourWidth = 0;

  const applyBoard = (next: WhiteboardData) => {
    board = next;
    paintBoard(ctx, board.strokes);
    if (drawing) drawStroke(ctx, drawing);
  };

  const rebuildColours = () => {
    const width = bar.clientWidth || root.clientWidth;
    if (width === colourWidth) return;
    colourWidth = width;
    const colours = coloursForWidth(width);
    if (!colours.includes(colour) && tool === "pen") colour = colours[0] ?? colour;
    coloursEl.replaceChildren(
      ...colours.map((c) => {
        const b = h("button", {
          type: "button",
          class: `wb-swatch${c === colour && tool === "pen" ? " on" : ""}`,
          style: `--wb:${c}`,
          "aria-label": `Colour ${c}`,
          "aria-pressed": c === colour && tool === "pen" ? "true" : "false",
        }) as HTMLButtonElement;
        b.addEventListener("click", (ev) => {
          ev.stopPropagation();
          tool = "pen";
          colour = c;
          eraseBtn.setAttribute("aria-pressed", "false");
          eraseBtn.classList.remove("on");
          rebuildColours();
        });
        return b;
      }),
    );
  };

  const ro = new ResizeObserver(() => rebuildColours());
  ro.observe(bar);
  rebuildColours();

  eraseBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    tool = "erase";
    eraseBtn.setAttribute("aria-pressed", "true");
    eraseBtn.classList.add("on");
    rebuildColours();
  });

  const stopClearHold = () => {
    window.clearTimeout(clearTimer);
    clearTimer = undefined;
    clearStarted = 0;
    clearBtn.classList.remove("holding");
    clearFill.style.transform = "scaleX(0)";
  };

  const doClear = () => {
    stopClearHold();
    const revision = board.revision;
    board = { revision: revision + 1, updatedAt: Date.now(), strokes: [] };
    drawing = null;
    paintBoard(ctx, []);
    void send("whiteboard", { op: "clear", revision }).then(() => refresh("whiteboard"));
  };

  const startClearHold = (ev: PointerEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    stopClearHold();
    clearStarted = Date.now();
    clearBtn.classList.add("holding");
    clearFill.style.transform = "scaleX(0)";
    const tick = () => {
      const t = (Date.now() - clearStarted) / CLEAR_HOLD_MS;
      clearFill.style.transform = `scaleX(${Math.min(1, t)})`;
      if (t >= 1) doClear();
      else clearTimer = window.setTimeout(tick, 32);
    };
    clearTimer = window.setTimeout(tick, 32);
  };

  clearBtn.addEventListener("pointerdown", startClearHold);
  clearBtn.addEventListener("pointerup", stopClearHold);
  clearBtn.addEventListener("pointerleave", stopClearHold);
  clearBtn.addEventListener("pointercancel", stopClearHold);
  clearBtn.addEventListener("click", (ev) => ev.preventDefault());

  const endStroke = () => {
    if (!drawing) {
      pointerId = null;
      return;
    }
    const stroke = drawing;
    drawing = null;
    pointerId = null;
    if (stroke.points.length < 2) return;
    board = { ...board, strokes: [...board.strokes, stroke], updatedAt: Date.now() };
    paintBoard(ctx, board.strokes);
    // Stale or refused: the refresh restores the shared board.
    void send("whiteboard", { op: "stroke", revision: board.revision, stroke }).then(() => refresh("whiteboard"));
  };

  const onPointerDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    const pt = pointerToBoard(canvas.getBoundingClientRect(), ev.clientX, ev.clientY);
    if (!pt) return;
    ev.preventDefault();
    canvas.setPointerCapture(ev.pointerId);
    pointerId = ev.pointerId;
    drawing = {
      id: strokeId(),
      tool,
      colour,
      points: [pt.x, pt.y],
      width: tool === "erase" ? ERASE_WIDTH : PEN_WIDTH,
    };
    drawStroke(ctx, drawing);
  };

  const onPointerMove = (ev: PointerEvent) => {
    if (pointerId !== ev.pointerId || !drawing) return;
    const pt = pointerToBoard(canvas.getBoundingClientRect(), ev.clientX, ev.clientY);
    if (!pt) return;
    if (!shouldAddPoint(drawing.points, pt.x, pt.y)) return;
    drawing.points.push(pt.x, pt.y);
    // Only the new segment — full redraw would flicker under a finger.
    const n = drawing.points.length;
    if (n >= 4) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = drawing.width;
      if (drawing.tool === "erase") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "#000";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = drawing.colour;
      }
      ctx.beginPath();
      ctx.moveTo(drawing.points[n - 4]!, drawing.points[n - 3]!);
      ctx.lineTo(drawing.points[n - 2]!, drawing.points[n - 1]!);
      ctx.stroke();
      ctx.restore();
    }
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);
  canvas.addEventListener("lostpointercapture", endStroke);

  const stopFeed = subscribe<WhiteboardData>("whiteboard", WHITEBOARD_EVERY, (data) => {
    // Don't clobber a stroke still under the finger.
    if (drawing) {
      board = data;
      return;
    }
    const same =
      data.revision === board.revision &&
      data.strokes.length === board.strokes.length &&
      data.strokes.every((s, i) => s.id === board.strokes[i]?.id);
    if (same) return;
    applyBoard(data);
  });

  return () => {
    stopFeed();
    ro.disconnect();
    stopClearHold();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", endStroke);
    canvas.removeEventListener("pointercancel", endStroke);
    canvas.removeEventListener("lostpointercapture", endStroke);
  };
};
