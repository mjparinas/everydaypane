"use client";

import { useEffect, useState } from "react";

import { familyAuthError, useFamilyAuth, useFamilyFetch } from "@/components/FamilyAuth";
import { addDays } from "@/lib/calendar";
import {
  MEAL_ICONS,
  MEAL_LABELS,
  MEAL_SLOTS,
  MEAL_WEEKDAYS,
  mealWeekday,
  normalizeRepeat,
  repeatLabel,
  type DayMeals,
  type MealOrigins,
  type MealRepeat,
  type MealRule,
  type MealSlot,
} from "@/lib/meals";

import { MealPlannerSkeleton } from "./Skeleton";

// The meal planner (Melvin, 2026-11-17), for phones: a week of days, each with breakfast, lunch and dinner. A meal
// saves as soon as you leave its box (no Save button), and displays show it within a minute. Meals planned lately are
// offered as suggestions. Recurring cadences (Melvin, 2026-11-23) fill future days from a rule; a one-off still wins
// for a single day, and clearing a rule-filled day skips only that day. Used by /family/, the admin Meals tab, and
// `/d/<token>/edit/`.

interface Plan {
  today: string;
  from: string;
  meals: Record<string, DayMeals>;
  origins: MealOrigins;
  rules: MealRule[];
  recent: string[];
}

const DAYS = 7;
const key = (date: string, slot: MealSlot) => `${date}|${slot}`;
const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const dayName = (date: string) => dateFmt.format(Date.parse(`${date}T12:00:00Z`));

function dayHeading(date: string, today: string): string {
  if (date === today) return `Today · ${dayName(date)}`;
  if (date === addDays(today, 1)) return `Tomorrow · ${dayName(date)}`;
  return dayName(date);
}

type Status = "saving" | "saved" | "error";

type CadenceKey = "once" | `interval:${number}` | `weekdays:${string}`;

function cadenceKey(repeat: MealRepeat | null | undefined): CadenceKey {
  if (!repeat) return "once";
  if (repeat.kind === "interval") return `interval:${repeat.every}`;
  return `weekdays:${repeat.days.join(",")}`;
}

function parseCadence(value: string): MealRepeat | null {
  if (value === "once") return null;
  if (value.startsWith("interval:")) {
    return normalizeRepeat({ kind: "interval", every: Number(value.slice("interval:".length)) });
  }
  if (value.startsWith("weekdays:")) {
    const days = value.slice("weekdays:".length).split(",").filter(Boolean).map(Number);
    return normalizeRepeat({ kind: "weekdays", days });
  }
  return null;
}

function optionsFor(date: string): { value: CadenceKey; label: string }[] {
  const wd = mealWeekday(date);
  const day = MEAL_WEEKDAYS[wd] ?? "day";
  return [
    { value: "once", label: "Just This Day" },
    { value: "interval:1", label: "Every Day" },
    { value: "interval:2", label: "Every 2 Days" },
    { value: "interval:3", label: "Every 3 Days" },
    { value: `weekdays:${wd}`, label: `Every ${day}` },
    { value: "weekdays:1,2,3,4,5", label: "Weekdays (Mon–Fri)" },
    { value: "weekdays:0,6", label: "Weekends" },
  ];
}

export function MealPlanner() {
  const familyFetch = useFamilyFetch();
  const { displayToken } = useFamilyAuth();
  const viaDisplay = Boolean(displayToken);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [cadence, setCadence] = useState<Record<string, CadenceKey>>({});
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [error, setError] = useState("");

  async function fetchPlan(from: string | null): Promise<Plan | string> {
    try {
      const r = await familyFetch(`/api/meals/?days=${DAYS}${from ? `&from=${from}` : ""}`);
      if (!r.ok) return familyAuthError(r.status, viaDisplay, "Couldn't load the meal plan.");
      const body = (await r.json()) as Plan;
      return { ...body, origins: body.origins ?? {}, rules: body.rules ?? [] };
    } catch {
      return "No connection.";
    }
  }

  function show(p: Plan | string) {
    if (typeof p === "string") return setError(p);
    setPlan(p);
    setError("");
  }
  const load = (from: string | null) => fetchPlan(from).then(show);

  useEffect(() => {
    let live = true;
    void fetchPlan(null).then((p) => live && show(p));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per token
  }, [displayToken]);

  function ruleFor(date: string, slot: MealSlot): MealRule | undefined {
    const origin = plan?.origins[date]?.[slot];
    if (!origin || origin.source !== "rule") return undefined;
    return plan?.rules.find((r) => r.id === origin.ruleId);
  }

  function currentCadence(date: string, slot: MealSlot): CadenceKey {
    const k = key(date, slot);
    if (cadence[k]) return cadence[k];
    const rule = ruleFor(date, slot);
    return cadenceKey(rule?.repeat);
  }

  async function save(date: string, slot: MealSlot, text: string, chosen: CadenceKey) {
    const k = key(date, slot);
    setStatus((s) => ({ ...s, [k]: "saving" }));
    const repeat = parseCadence(chosen);
    const existing = ruleFor(date, slot);
    try {
      const body =
        repeat && text.trim()
          ? { date, slot, text, repeat, ruleId: existing && cadenceKey(existing.repeat) === chosen ? existing.id : undefined }
          : { date, slot, text };
      const r = await familyFetch("/api/meals/", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const errBody = (await r.json().catch(() => ({}))) as { error?: string };
        setError(errBody.error ?? "Couldn't save that meal.");
        return setStatus((s) => ({ ...s, [k]: "error" }));
      }
      // Reload the week so origins and expanded days stay honest after a rule change.
      const refreshed = await fetchPlan(plan?.from ?? null);
      if (typeof refreshed === "string") {
        setError(refreshed);
        return setStatus((s) => ({ ...s, [k]: "error" }));
      }
      setPlan(refreshed);
      setDrafts((d) => {
        if (d[k] !== undefined && d[k] !== text) return d;
        return Object.fromEntries(Object.entries(d).filter(([x]) => x !== k));
      });
      setCadence((c) => {
        const next = { ...c };
        delete next[k];
        return next;
      });
      setStatus((s) => ({ ...s, [k]: "saved" }));
      setError("");
    } catch {
      setError("No connection. That meal wasn't saved.");
      setStatus((s) => ({ ...s, [k]: "error" }));
    }
  }

  async function stopRule(date: string, slot: MealSlot) {
    const rule = ruleFor(date, slot);
    if (!rule) return;
    const k = key(date, slot);
    setStatus((s) => ({ ...s, [k]: "saving" }));
    try {
      const r = await familyFetch("/api/meals/", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stopRuleId: rule.id }),
      });
      if (!r.ok) {
        setError("Couldn't stop that repeat.");
        return setStatus((s) => ({ ...s, [k]: "error" }));
      }
      const refreshed = await fetchPlan(plan?.from ?? null);
      if (typeof refreshed === "string") {
        setError(refreshed);
        return setStatus((s) => ({ ...s, [k]: "error" }));
      }
      setPlan(refreshed);
      setStatus((s) => ({ ...s, [k]: "saved" }));
    } catch {
      setError("No connection. That repeat wasn't stopped.");
      setStatus((s) => ({ ...s, [k]: "error" }));
    }
  }

  async function updateSeries(date: string, slot: MealSlot, text: string) {
    const rule = ruleFor(date, slot);
    if (!rule) return;
    const k = key(date, slot);
    setStatus((s) => ({ ...s, [k]: "saving" }));
    try {
      const r = await familyFetch("/api/meals/", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: "series", ruleId: rule.id, text }),
      });
      if (!r.ok) {
        setError("Couldn't update that series.");
        return setStatus((s) => ({ ...s, [k]: "error" }));
      }
      const refreshed = await fetchPlan(plan?.from ?? null);
      if (typeof refreshed === "string") {
        setError(refreshed);
        return setStatus((s) => ({ ...s, [k]: "error" }));
      }
      setPlan(refreshed);
      setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([x]) => x !== k)));
      setStatus((s) => ({ ...s, [k]: "saved" }));
    } catch {
      setError("No connection. That series wasn't updated.");
      setStatus((s) => ({ ...s, [k]: "error" }));
    }
  }

  if (!plan) return error ? <p className="text-sm text-bad">{error}</p> : <MealPlannerSkeleton />;
  const days = Array.from({ length: DAYS }, (_, i) => addDays(plan.from, i));
  const step = (n: number) => void load(addDays(plan.from, n));

  return (
    // Columns follow the planner's width (not the viewport), so a phone-width page never packs three days across
    // just because the screen is desktop-sized — Melvin, 2026-11-23.
    <div className="@container grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="btn-ghost shrink-0 px-3 whitespace-nowrap" onClick={() => step(-DAYS)} aria-label="Earlier week">
          ‹ Earlier
        </button>
        {plan.from !== plan.today ? (
          <button type="button" className="btn-ghost" onClick={() => void load(null)}>
            Back to Today
          </button>
        ) : (
          <p className="min-w-0 text-center text-sm text-soft">Saves as you go</p>
        )}
        <button type="button" className="btn-ghost shrink-0 px-3 whitespace-nowrap" onClick={() => step(DAYS)} aria-label="Later week">
          Later ›
        </button>
      </div>
      {error && (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      )}
      <datalist id="meal-suggestions">
        {plan.recent.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <div className="grid gap-3 @min-[40rem]:grid-cols-2 @min-[60rem]:grid-cols-3">
        {days.map((date) => (
          <section key={date} className="card grid gap-3" aria-label={dayHeading(date, plan.today)}>
            <h3 className={`text-sm font-bold ${date === plan.today ? "text-brand" : ""}`}>{dayHeading(date, plan.today)}</h3>
            {MEAL_SLOTS.map((slot) => {
              const k = key(date, slot);
              const saved = plan.meals[date]?.[slot] ?? "";
              const value = drafts[k] ?? saved;
              const st = status[k];
              const rule = ruleFor(date, slot);
              const chosen = currentCadence(date, slot);
              const opts = optionsFor(date);
              // Keep the current rule's cadence in the list even if it isn't a preset.
              if (rule && !opts.some((o) => o.value === cadenceKey(rule.repeat))) {
                opts.splice(1, 0, { value: cadenceKey(rule.repeat), label: repeatLabel(rule.repeat) });
              }
              return (
                <div key={slot} className="grid gap-1.5">
                  <label className="grid grid-cols-[auto_1fr] items-center gap-2 text-sm @min-[40rem]:grid-cols-1 @min-[40rem]:items-stretch @min-[40rem]:gap-1">
                    <span className="w-[6.5rem] shrink-0 font-medium @min-[40rem]:w-auto">
                      <span aria-hidden="true">{MEAL_ICONS[slot]}</span> {MEAL_LABELS[slot]}
                    </span>
                    <span className="relative min-w-0">
                      <input
                        className="field w-full pr-8"
                        value={value}
                        maxLength={120}
                        list="meal-suggestions"
                        placeholder="Not planned"
                        enterKeyHint="done"
                        onChange={(e) => setDrafts((d) => ({ ...d, [k]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        onBlur={() => {
                          const sameText = value.trim() === saved;
                          const sameCadence = cadenceKey(rule?.repeat) === chosen || (!rule && chosen === "once");
                          if (sameText && sameCadence && !cadence[k]) return;
                          void save(date, slot, value, chosen);
                        }}
                      />
                      <span
                        className={`pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs ${st === "error" ? "text-bad" : "text-soft"}`}
                        aria-live="polite"
                      >
                        {st === "saving" ? "…" : st === "saved" ? "✓" : st === "error" ? "!" : ""}
                      </span>
                    </span>
                  </label>
                  {/* Repeat shows once a meal has words (or a series already fills it): seven days of three empty
                      meals used to carry 21 "Just This Day" menus (Melvin, 2026-11-28: the family page felt busy). */}
                  {value.trim() || rule ? (
                    <div className="grid grid-cols-[auto_1fr] items-center gap-2 text-xs @min-[40rem]:grid-cols-1 @min-[40rem]:items-stretch @min-[40rem]:gap-1">
                      <span className="w-[6.5rem] shrink-0 text-soft @min-[40rem]:w-auto">Repeat</span>
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <select
                          className="field min-w-0 flex-1 py-1 text-xs"
                          value={chosen}
                          aria-label={`Repeat ${MEAL_LABELS[slot]} on ${dayName(date)}`}
                          onChange={(e) => {
                            const next = e.target.value as CadenceKey;
                            setCadence((c) => ({ ...c, [k]: next }));
                            if (value.trim()) void save(date, slot, value, next);
                          }}
                        >
                          {opts.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        {rule ? (
                          <>
                            <span className="text-soft" title={repeatLabel(rule.repeat)}>
                              ↻ {repeatLabel(rule.repeat)}
                            </span>
                            {value.trim() && value.trim() !== rule.text ? (
                              <button
                                type="button"
                                className="btn-ghost px-1.5 py-0.5 text-xs"
                                onClick={() => void updateSeries(date, slot, value)}
                              >
                                Update Series
                              </button>
                            ) : null}
                            <button type="button" className="btn-ghost px-1.5 py-0.5 text-xs" onClick={() => void stopRule(date, slot)}>
                              Stop
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
