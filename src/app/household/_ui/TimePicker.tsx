"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

import { Field } from "./fields";

// Android-style dial clock (Melvin, 2026-11-22): tap the field to open a round clock face, hour then minute,
// instead of the browser's plain time input.

const SIZE = 256;
const CX = SIZE / 2;
const CY = SIZE / 2;
const OUTER = 96;
const INNER = 62;

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function toHhmm(minutes: number): string {
  const m = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

function fromHhmm(value: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function formatDisplay(value: string, hour12: boolean): string {
  const mins = fromHhmm(value);
  if (mins == null) return value || "—";
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  if (!hour12) return `${pad(h24)}:${pad(m)}`;
  const am = h24 < 12;
  const h12 = h24 % 12 || 12;
  return `${h12}:${pad(m)} ${am ? "AM" : "PM"}`;
}

function angleFor(index: number, total: number): number {
  return (index / total) * 2 * Math.PI - Math.PI / 2;
}

function point(index: number, total: number, radius: number): { x: number; y: number } {
  const a = angleFor(index, total);
  return { x: CX + radius * Math.cos(a), y: CY + radius * Math.sin(a) };
}

function dialValueFromPointer(clientX: number, clientY: number, rect: DOMRect, hour12: boolean, selecting: "hour" | "minute"): number {
  const x = ((clientX - rect.left) / rect.width) * SIZE - CX;
  const y = ((clientY - rect.top) / rect.height) * SIZE - CY;
  let deg = (Math.atan2(y, x) * 180) / Math.PI + 90;
  if (deg < 0) deg += 360;
  if (selecting === "minute") return Math.round(deg / 6) % 60;
  if (hour12) {
    const hour = Math.round(deg / 30) % 12;
    return hour;
  }
  const dist = Math.hypot(x, y);
  const hour12ish = Math.round(deg / 30) % 12;
  return dist < (INNER + OUTER) / 2 ? hour12ish : hour12ish === 0 ? 12 : hour12ish + 12;
}

export function TimePicker({
  label,
  value,
  onChange,
  hour12,
  hint,
  optional = false,
  emptyLabel = "None",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hour12: boolean;
  hint?: string;
  /** When true, an empty value is allowed (commute "be there by"). */
  optional?: boolean;
  emptyLabel?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dialRef = useRef<SVGSVGElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 300 });
  const [selecting, setSelecting] = useState<"hour" | "minute">("hour");
  const [draft, setDraft] = useState(0);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const width = Math.min(320, Math.max(280, r.width));
    const left = Math.min(window.innerWidth - width - 8, Math.max(8, r.left));
    const below = r.bottom + 8;
    const height = 380;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, r.top - height - 8) : below;
    setPos({ top, left, width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  function openPicker() {
    setDraft(fromHhmm(value) ?? 8 * 60);
    setSelecting("hour");
    setOpen(true);
  }

  function commit(minutes: number) {
    onChange(toHhmm(minutes));
  }

  function applyPointer(e: ReactPointerEvent, advance: boolean) {
    const svg = dialRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const h24 = Math.floor(draft / 60);
    const m = draft % 60;
    if (selecting === "minute") {
      const nextM = dialValueFromPointer(e.clientX, e.clientY, rect, hour12, "minute");
      const next = h24 * 60 + nextM;
      setDraft(next);
      if (advance) {
        commit(next);
        setOpen(false);
      }
      return;
    }
    let nextH: number;
    if (hour12) {
      const hour = dialValueFromPointer(e.clientX, e.clientY, rect, true, "hour");
      const am = h24 < 12;
      nextH = am ? hour % 12 : (hour % 12) + 12;
    } else {
      nextH = dialValueFromPointer(e.clientX, e.clientY, rect, false, "hour");
    }
    const next = nextH * 60 + m;
    setDraft(next);
    if (advance) setSelecting("minute");
  }

  const h24 = Math.floor(draft / 60);
  const minute = draft % 60;
  const h12 = h24 % 12 || 12;
  const isAm = h24 < 12;
  const handIndex = selecting === "hour" ? (hour12 ? h24 % 12 : h24 % 12) : minute;
  const handTotal = selecting === "hour" ? 12 : 60;
  const handRadius = !hour12 && selecting === "hour" && h24 >= 12 ? INNER : OUTER;
  const hand = point(handIndex, handTotal, selecting === "hour" ? handRadius : OUTER);

  const hourMarks = hour12
    ? Array.from({ length: 12 }, (_, i) => ({ value: i === 0 ? 12 : i, index: i, radius: OUTER }))
    : [
        ...Array.from({ length: 12 }, (_, i) => ({ value: i === 0 ? 0 : i, index: i, radius: INNER })),
        ...Array.from({ length: 12 }, (_, i) => ({ value: i === 0 ? 12 : i + 12, index: i, radius: OUTER })),
      ];

  const panel =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={`${label} clock`}
            className="fixed z-50 rounded-2xl border border-line bg-panel p-4 shadow-xl"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            <div className="mb-3 flex items-center justify-center gap-2">
              <button
                type="button"
                className={`rounded-xl px-3 py-2 font-semibold tabular-nums ${selecting === "hour" ? "bg-brand text-brand-ink" : "bg-bg text-ink"}`}
                onClick={() => setSelecting("hour")}
              >
                {hour12 ? h12 : pad(h24)}
              </button>
              <span className="text-2xl font-semibold text-soft">:</span>
              <button
                type="button"
                className={`rounded-xl px-3 py-2 font-semibold tabular-nums ${selecting === "minute" ? "bg-brand text-brand-ink" : "bg-bg text-ink"}`}
                onClick={() => setSelecting("minute")}
              >
                {pad(minute)}
              </button>
              {hour12 && (
                <div className="ml-2 grid gap-1">
                  {(["AM", "PM"] as const).map((labelAm) => {
                    const am = labelAm === "AM";
                    return (
                      <button
                        key={labelAm}
                        type="button"
                        className={`rounded-lg px-2 py-1 text-xs font-semibold ${isAm === am ? "bg-brand text-brand-ink" : "bg-bg text-soft"}`}
                        onClick={() => {
                          const base = (h24 % 12) + (am ? 0 : 12);
                          setDraft(base * 60 + minute);
                        }}
                      >
                        {labelAm}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <svg
              ref={dialRef}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="mx-auto block w-full max-w-[260px] touch-none select-none"
              onPointerDown={(e) => {
                (e.target as Element).setPointerCapture?.(e.pointerId);
                applyPointer(e, false);
              }}
              onPointerMove={(e) => {
                if (e.buttons === 0) return;
                applyPointer(e, false);
              }}
              onPointerUp={(e) => applyPointer(e, true)}
            >
              <circle cx={CX} cy={CY} r={OUTER + 18} className="fill-[var(--color-bg)]" />
              <line x1={CX} y1={CY} x2={hand.x} y2={hand.y} stroke="var(--color-brand)" strokeWidth="3" strokeLinecap="round" />
              <circle cx={CX} cy={CY} r={6} className="fill-brand" />
              <circle cx={hand.x} cy={hand.y} r={22} className="fill-brand" />
              {selecting === "hour"
                ? hourMarks.map((mark) => {
                    const p = point(mark.index, 12, mark.radius);
                    const selected = hour12 ? (h24 % 12 || 12) === mark.value : h24 === mark.value;
                    return (
                      <text
                        key={`${mark.radius}-${mark.value}`}
                        x={p.x}
                        y={p.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className={`text-sm font-semibold ${selected ? "fill-brand-ink" : "fill-ink"}`}
                        style={{ pointerEvents: "none" }}
                      >
                        {mark.value}
                      </text>
                    );
                  })
                : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => {
                    const p = point(m, 60, OUTER);
                    const selected = minute === m;
                    return (
                      <text
                        key={m}
                        x={p.x}
                        y={p.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className={`text-sm font-semibold ${selected ? "fill-brand-ink" : "fill-ink"}`}
                        style={{ pointerEvents: "none" }}
                      >
                        {pad(m)}
                      </text>
                    );
                  })}
            </svg>

            <div className="mt-3 flex justify-end gap-2">
              {optional && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  {emptyLabel}
                </button>
              )}
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  commit(draft);
                  setOpen(false);
                }}
              >
                Set
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <>
          <button
            ref={triggerRef}
            id={id}
            type="button"
            className="field flex items-center justify-between gap-2 text-left"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => (open ? setOpen(false) : openPicker())}
          >
            <span className={`tabular-nums ${value ? "" : "text-soft"}`}>
              {value ? formatDisplay(value, hour12) : optional ? emptyLabel : "Pick a time"}
            </span>
            <ClockIcon />
          </button>
          {panel}
        </>
      )}
    </Field>
  );
}

function ClockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 flex-none text-soft">
      <path
        fill="currentColor"
        d="M10 1.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm0 1.5a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm-.75 2.5a.75.75 0 0 1 1.5 0V10c0 .2-.08.39-.22.53l-2.5 2.5a.75.75 0 1 1-1.06-1.06l2.28-2.28V5.5Z"
      />
    </svg>
  );
}
