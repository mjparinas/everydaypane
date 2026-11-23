"use client";

import { PERIOD_LABELS, PERIODS } from "@/lib/config/periods";
import type { PeriodStart } from "@/lib/config/schema";
import { periodStartMinutes } from "@/lib/config/time";

import { Range, Section, Select, Toggle } from "./fields";
import { useAdmin } from "./store";
import { TimePicker } from "./TimePicker";

// Views that change through the day (Melvin, 2026-11-17: morning, afternoon, evening, overnight), each in day or
// night colours. Each part starts at a fixed time, sunrise or sunset, and lasts until the next one starts.
// Sunrise/sunset come from today's weather at the dashboard location (Melvin, 2026-11-22).

const START_KINDS = [
  { value: "fixed", label: "Fixed time" },
  { value: "sunrise", label: "Sunrise" },
  { value: "sunset", label: "Sunset" },
] as const;

const DEFAULT_FIXED: Record<(typeof PERIODS)[number], string> = {
  morning: "06:00",
  afternoon: "11:00",
  evening: "18:00",
  night: "22:00",
};

function startKind(start: PeriodStart): "fixed" | "sunrise" | "sunset" {
  return start === "sunrise" || start === "sunset" ? start : "fixed";
}

export function SchedulePanel() {
  const config = useAdmin((s) => s.config);
  const edit = useAdmin((s) => s.edit);
  const s = config.schedule;
  const views = config.views.map((v) => ({ value: v.id, label: v.name }));
  const starts = PERIODS.map((p) => periodStartMinutes(s[p].start));
  const outOfOrder = starts.some((t, i) => i > 0 && t <= starts[i - 1]!) && !(starts[3]! < starts[0]!);

  return (
    <div className="grid gap-4">
      <Section title="Through the day">
        <Toggle
          label="Change views through the day"
          checked={s.enabled}
          hint="When this is off, displays that follow the schedule show the first view all day. Sunrise and sunset use today's times for your location under Settings."
          onChange={(v) => edit((c) => void (c.schedule.enabled = v))}
        />
        {outOfOrder && (
          <p className="rounded-xl bg-bg p-3 text-sm text-bad" role="alert">
            The start times are out of order. Each part of the day lasts until the next one starts.
          </p>
        )}
      </Section>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PERIODS.map((p) => {
          const kind = startKind(s[p].start);
          return (
            <Section key={p} title={PERIOD_LABELS[p]}>
              <Select
                label="Starts at"
                value={kind}
                options={START_KINDS}
                onChange={(v) =>
                  edit((c) => {
                    c.schedule[p].start = v === "fixed" ? DEFAULT_FIXED[p] : v;
                  })
                }
              />
              {kind === "fixed" && (
                <TimePicker
                  label="Time"
                  value={s[p].start === "sunrise" || s[p].start === "sunset" ? DEFAULT_FIXED[p] : s[p].start}
                  hour12={config.hour12}
                  onChange={(v) => edit((c) => void (c.schedule[p].start = v))}
                />
              )}
              <Select label="View" value={s[p].viewId} options={views} onChange={(v) => edit((c) => void (c.schedule[p].viewId = v))} />
              <Select
                label="Colours"
                value={s[p].mode}
                options={[
                  { value: "day", label: "Day" },
                  { value: "night", label: "Night" },
                ]}
                onChange={(v) => edit((c) => void (c.schedule[p].mode = v))}
              />
              <Range
                label="Dim the screen"
                value={s[p].dim}
                min={0}
                max={0.9}
                step={0.05}
                format={(v) => (v === 0 ? "off" : `${Math.round(v * 100)}%`)}
                onChange={(v) => edit((c) => void (c.schedule[p].dim = v))}
              />
            </Section>
          );
        })}
      </div>
    </div>
  );
}
