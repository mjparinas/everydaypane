"use client";

import { useEffect, useState, type ReactNode } from "react";

export function Tile({ label, value, hint, delta }: { label: string; value: string; hint?: string; delta?: number | null }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <p className="text-xs font-semibold tracking-wide text-soft uppercase">{label}</p>
      <p className="mt-1 font-display text-3xl font-extrabold tracking-tight">
        {value}
        {hint ? <span className="ml-2 text-sm font-semibold text-soft">{hint}</span> : null}
      </p>
      {delta != null && Number.isFinite(delta) ? (
        <p className={`mt-1 text-xs font-semibold ${delta >= 0 ? "text-good" : "text-bad"}`}>
          {delta >= 0 ? "+" : ""}
          {Math.round(delta)}% vs prior
        </p>
      ) : null}
    </div>
  );
}

export function Card({ title, sub, right, children }: { title: string; sub?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-base font-bold">{title}</h3>
          {sub ? <p className="text-sm text-soft">{sub}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs tracking-wide text-soft uppercase">
            {headers.map((h) => (
              <th key={h} className="px-2 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-b border-line/70 last:border-0">
              {cells.map((c, j) => (
                <td key={j} className="px-2 py-2 align-top">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Bars({ items }: { items: { label: string; value: number }[] }) {
  if (items.length === 0) return <p className="text-sm text-soft">Nothing in this period.</p>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="grid gap-2">
      {items.map((i) => (
        <li key={i.label} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-2 text-sm">
          <span className="truncate text-soft" title={i.label}>
            {i.label}
          </span>
          <div className="h-2 overflow-hidden rounded-full bg-bg" aria-hidden>
            <div className="h-full rounded-full bg-brand" style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
          <span className="tabular-nums font-semibold">{i.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function Columns({ days }: { days: { day: string; n: number }[] }) {
  if (days.length === 0) return <p className="text-sm text-soft">No days in this period.</p>;
  const max = Math.max(1, ...days.map((d) => d.n));
  const total = days.reduce((n, d) => n + d.n, 0);
  return (
    <div
      className="flex h-32 items-end gap-1"
      role="img"
      aria-label={`Daily counts, ${days.length} days, ${total} total`}
    >
      {days.map((d) => (
        <div
          key={d.day}
          className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
          title={`${d.day}: ${d.n}`}
        >
          <div
            className="w-full rounded-t bg-brand/80"
            style={{ height: `${(d.n / max) * 100}%`, minHeight: d.n ? 4 : 0 }}
            aria-label={`${d.day}: ${d.n}`}
          />
        </div>
      ))}
    </div>
  );
}

export function Bones({ lines = 4 }: { lines?: number }) {
  return (
    <div className="grid gap-3" role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-xl bg-line/60" />
      ))}
    </div>
  );
}

/** Tap once to arm, tap again to run — no browser dialog. */
export function ConfirmButton({
  label,
  confirm = "Tap again to confirm",
  onConfirm,
  variant = "danger",
  disabled,
  busy,
  pressed,
}: {
  label: string;
  confirm?: string;
  onConfirm: () => void;
  variant?: "danger" | "primary" | "ghost";
  disabled?: boolean;
  busy?: boolean;
  /** Underlying on/off when the control is a toggle (not the arming state). */
  pressed?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);
  const tone =
    variant === "primary" ? "btn-primary" : variant === "ghost" ? "btn-ghost" : "btn-ghost text-bad";
  return (
    <button
      type="button"
      className={`${tone} text-sm disabled:opacity-50 ${armed ? "ring-2 ring-brand/40" : ""}`}
      disabled={disabled || busy}
      aria-pressed={armed ? true : pressed}
      onClick={() => {
        if (busy) return;
        if (armed) {
          onConfirm();
          setArmed(false);
          return;
        }
        setArmed(true);
      }}
    >
      {busy ? "Working…" : armed ? confirm : label}
    </button>
  );
}
