"use client";

import { PERIODS } from "@/lib/config/periods";

import { Range, Section, Select, Text, Toggle } from "./fields";
import { useAdmin } from "./store";

// Views that change through the day (Melvin, 2026-11-17: morning, afternoon, evening, night), each in day or night
// mode. Each part starts at its time and lasts until the next one starts.

const NAMES = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", night: "Night" } as const;

export function SchedulePanel() {
  const config = useAdmin((s) => s.config);
  const edit = useAdmin((s) => s.edit);
  const s = config.schedule;
  const views = config.views.map((v) => ({ value: v.id, label: v.name }));
  const starts = PERIODS.map((p) => s[p].start);
  const outOfOrder = starts.some((t, i) => i > 0 && t <= starts[i - 1]!) && !(starts[3]! < starts[0]!);

  return (
    <div className="grid gap-4">
      <Section title="Through the day">
        <Toggle
          label="Change views through the day"
          checked={s.enabled}
          hint="When this is off, displays that follow the schedule show the first view all day."
          onChange={(v) => edit((c) => void (c.schedule.enabled = v))}
        />
        {outOfOrder && (
          <p className="rounded-xl bg-bg p-3 text-sm text-bad" role="alert">
            The start times are out of order. Each part of the day lasts until the next one starts.
          </p>
        )}
      </Section>
      <div className="grid gap-4 md:grid-cols-2">
        {PERIODS.map((p) => (
          <Section key={p} title={NAMES[p]}>
            <Text label="Starts at" type="time" value={s[p].start} onChange={(v) => v && edit((c) => void (c.schedule[p].start = v))} />
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
        ))}
      </div>
    </div>
  );
}
