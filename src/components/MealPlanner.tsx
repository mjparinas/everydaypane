"use client";

import { useEffect, useState } from "react";

import { familyAuthError, useFamilyAuth, useFamilyFetch } from "@/components/FamilyAuth";
import { addDays } from "@/lib/calendar";
import { MEAL_ICONS, MEAL_LABELS, MEAL_SLOTS, type DayMeals, type MealSlot } from "@/lib/meals";

// The meal planner (Melvin, 2026-11-17), for phones: a week of days, each with breakfast, lunch and dinner. A meal
// saves as soon as you leave its box (no Save button), and displays show it within a minute. Meals planned lately are
// offered as suggestions. Used by /family/, the admin Meals tab, and `/d/<token>/edit/`.

interface Plan {
  today: string;
  from: string;
  meals: Record<string, DayMeals>;
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

export function MealPlanner() {
  const familyFetch = useFamilyFetch();
  const { displayToken } = useFamilyAuth();
  const viaDisplay = Boolean(displayToken);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [error, setError] = useState("");

  async function fetchPlan(from: string | null): Promise<Plan | string> {
    try {
      const r = await familyFetch(`/api/meals/?days=${DAYS}${from ? `&from=${from}` : ""}`);
      if (!r.ok) return familyAuthError(r.status, viaDisplay, "Couldn't load the meal plan.");
      return (await r.json()) as Plan;
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

  async function save(date: string, slot: MealSlot, text: string) {
    const k = key(date, slot);
    setStatus((s) => ({ ...s, [k]: "saving" }));
    try {
      const r = await familyFetch("/api/meals/", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, slot, text }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Couldn't save that meal.");
        return setStatus((s) => ({ ...s, [k]: "error" }));
      }
      setPlan((p) => {
        if (!p) return p;
        const day = { ...p.meals[date] };
        if (text.trim()) day[slot] = text.trim();
        else delete day[slot];
        const recent = text.trim() && !p.recent.includes(text.trim()) ? [text.trim(), ...p.recent] : p.recent;
        return { ...p, meals: { ...p.meals, [date]: day }, recent };
      });
      // Only clear the draft when it still matches what we saved — keystrokes typed during the request stay.
      setDrafts((d) => {
        if (d[k] !== undefined && d[k] !== text) return d;
        return Object.fromEntries(Object.entries(d).filter(([x]) => x !== k));
      });
      setStatus((s) => ({ ...s, [k]: "saved" }));
    } catch {
      setError("No connection. That meal wasn't saved.");
      setStatus((s) => ({ ...s, [k]: "error" }));
    }
  }

  if (!plan) return <p className="text-sm text-soft">{error || "Loading…"}</p>;
  const days = Array.from({ length: DAYS }, (_, i) => addDays(plan.from, i));
  const step = (n: number) => void load(addDays(plan.from, n));

  return (
    // Columns follow the planner's width (not the viewport), so a phone-width page never packs three days across
    // just because the screen is desktop-sized — Melvin, 2026-11-23.
    <div className="@container grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <button className="btn-ghost" onClick={() => step(-DAYS)} aria-label="Earlier week">
          ‹ Earlier
        </button>
        {plan.from !== plan.today ? (
          <button className="btn-ghost" onClick={() => void load(null)}>
            Back to today
          </button>
        ) : (
          <p className="text-sm text-soft">Saves as you go</p>
        )}
        <button className="btn-ghost" onClick={() => step(DAYS)} aria-label="Later week">
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
          <section key={date} className="card grid gap-2" aria-label={dayHeading(date, plan.today)}>
            <h3 className={`text-sm font-bold ${date === plan.today ? "text-brand" : ""}`}>{dayHeading(date, plan.today)}</h3>
            {MEAL_SLOTS.map((slot) => {
              const k = key(date, slot);
              const saved = plan.meals[date]?.[slot] ?? "";
              const value = drafts[k] ?? saved;
              const st = status[k];
              return (
                <label
                  key={slot}
                  className="grid grid-cols-[auto_1fr] items-center gap-2 text-sm @min-[40rem]:grid-cols-1 @min-[40rem]:items-stretch @min-[40rem]:gap-1"
                >
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
                        if (value.trim() !== saved) void save(date, slot, value);
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
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
