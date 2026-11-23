"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

// Small form controls for the admin panel. Every control is at least 44 px tall so it works with a thumb.
// Bounded numbers use Range or Stepper (min/max always visible); NumberInput is only for rare free-form values.

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children(id)}
      {hint ? <p className="text-xs text-soft">{hint}</p> : null}
    </div>
  );
}

export function Text({
  label,
  value,
  onChange,
  hint,
  maxLength,
  placeholder,
  type = "text",
  list,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  maxLength?: number;
  placeholder?: string;
  type?: "text" | "password" | "url" | "time" | "date";
  /** The id of a <datalist> of suggestions. */
  list?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <input
          id={id}
          className="field"
          type={type}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          list={list}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
        />
      )}
    </Field>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}) {
  return (
    <Field label={label}>
      {(id) => (
        <textarea id={id} className="field min-h-24 py-2" value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}

/** Free-form number (lat/lon). Drafts while focused so typing mid-value is not clamped. Prefer Range/Stepper for bounded UI. */
export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  hint?: ReactNode;
}) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  function commit(raw: string) {
    const n = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(n)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, n));
    onChange(clamped);
    setDraft(String(clamped));
  }

  return (
    <Field
      label={label}
      hint={
        hint ?? (
          <span className="tabular-nums">
            {min} – {max}
          </span>
        )
      }
    >
      {(id) => (
        <input
          id={id}
          className="field tabular-nums"
          type="text"
          inputMode="decimal"
          value={focused ? draft : String(value)}
          onFocus={() => {
            setFocused(true);
            setDraft(String(value));
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setFocused(false);
            commit(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          aria-valuemin={min}
          aria-valuemax={max}
          data-step={step}
        />
      )}
    </Field>
  );
}

export function Range({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format = (v) => String(v),
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  hint?: ReactNode;
}) {
  return (
    <Field label={`${label}: ${format(value)}`} hint={hint}>
      {(id) => (
        <div className="grid gap-1">
          <input
            id={id}
            className="h-11 w-full accent-brand"
            type="range"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <div className="flex justify-between text-xs tabular-nums text-soft">
            <span>{format(min)}</span>
            <span>{format(max)}</span>
          </div>
        </div>
      )}
    </Field>
  );
}

/** Large − / + for discrete counts where a slider is awkward. Shows min–max under the value. */
export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format = (v) => String(v),
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  hint?: ReactNode;
}) {
  const id = useId();
  const dec = () => onChange(Math.max(min, roundStep(value - step, step, min)));
  const inc = () => onChange(Math.min(max, roundStep(value + step, step, min)));
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-ghost min-h-11 min-w-11 px-0 text-xl"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={dec}
        >
          −
        </button>
        <output id={id} className="min-w-0 flex-1 text-center text-base font-semibold tabular-nums" aria-live="polite">
          {format(value)}
        </output>
        <button
          type="button"
          className="btn-ghost min-h-11 min-w-11 px-0 text-xl"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={inc}
        >
          +
        </button>
      </div>
      <p className="text-center text-xs tabular-nums text-soft">
        {format(min)} – {format(max)}
      </p>
      {hint ? <p className="text-xs text-soft">{hint}</p> : null}
    </div>
  );
}

function roundStep(n: number, step: number, min: number): number {
  const steps = Math.round((n - min) / step);
  return min + steps * step;
}

/** Chip row for 2–6 fixed choices (grid presets, common intervals). */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="grid gap-1" role="group" aria-labelledby={id}>
      <p id={id} className="text-sm font-medium">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={value === o.value ? "btn-primary min-h-11" : "btn-ghost min-h-11"}
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {hint ? <p className="text-xs text-soft">{hint}</p> : null}
    </div>
  );
}

export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  hint?: ReactNode;
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          aria-hidden="true"
          className="relative h-7 w-12 flex-none rounded-full bg-line transition peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 after:absolute after:top-1 after:left-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5"
        />
      </label>
      {hint ? <p className="text-xs text-soft">{hint}</p> : null}
    </div>
  );
}

export function Colour({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      {(id) => (
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="color"
            className="h-11 w-14 flex-none cursor-pointer rounded-xl border border-line bg-panel p-1"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <input
            aria-label={`${label} (hex)`}
            className="field font-mono"
            value={value}
            maxLength={7}
            onChange={(e) => {
              if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value.toLowerCase());
            }}
          />
        </div>
      )}
    </Field>
  );
}

export function Section({
  title,
  children,
  actions,
  id,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  /** Anchor id for Settings jump links (#settings/…). */
  id?: string;
}) {
  return (
    <section id={id} className="card grid scroll-mt-28 content-start gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** A delete button that asks "Sure?" in place, instead of a browser dialog. */
export function ConfirmButton({
  label,
  confirm = "Tap again to confirm",
  onConfirm,
}: {
  label: string;
  confirm?: string;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className="btn-ghost text-bad"
      onClick={() => {
        if (armed) onConfirm();
        setArmed(!armed);
      }}
    >
      {armed ? confirm : label}
    </button>
  );
}
