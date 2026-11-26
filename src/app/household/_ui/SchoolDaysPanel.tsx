"use client";

import { useState } from "react";

import { LUNCH_DAYS, SCHOOL_PRESETS, sortDays } from "@/lib/schoolCalendar";

import { Section, Select, Text, Toggle } from "./fields";
import { useAdmin } from "./store";

// School days (Melvin, 2026-11-26): the school year the School days widget counts from. A preset fills in a district's
// published calendar in one tap (Langley's 2026–27 elementary and middle calendars; the district has PDFs only, no
// iCal link), days can be added or changed by hand, and a school's own calendar link can add its Pro-D days too.

const KINDS = [
  { value: "off", label: "No School" },
  { value: "early", label: "Early Dismissal" },
] as const;

export function SchoolDaysPanel() {
  const school = useAdmin((s) => s.config.school);
  const icals = useAdmin((s) => s.config.integrations.icals);
  const edit = useAdmin((s) => s.edit);
  const [preset, setPreset] = useState(SCHOOL_PRESETS[0]?.id ?? "");
  const picked = SCHOOL_PRESETS.find((p) => p.id === preset);

  function fill() {
    if (!picked) return;
    edit((c) => {
      c.school.calendarName = picked.calendarName;
      c.school.firstDay = picked.firstDay;
      c.school.lastDay = picked.lastDay;
      c.school.daysOff = picked.daysOff.map((d) => ({ ...d }));
    });
  }

  return (
    <Section id="settings-school-days" title="School Days">
      <p className="text-xs text-soft">
        The School days widget says whether there&apos;s school today, flags tomorrow&apos;s day off and counts down to the next Pro-D day
        and break. Weekends are always off; the days below are the rest.
      </p>
      <div className="grid gap-2 rounded-xl border border-line p-3">
        <Select
          label="Fill in a School Year"
          value={preset}
          options={SCHOOL_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
          onChange={setPreset}
          hint={picked ? `From the ${picked.source}. Replaces the list below.` : undefined}
        />
        <button type="button" className="btn-ghost justify-self-start" onClick={fill}>
          Fill In {picked?.label ?? "school year"}
        </button>
      </div>
      <Text
        label="Calendar Name"
        value={school.calendarName}
        maxLength={60}
        placeholder="Langley elementary"
        onChange={(v) => edit((c) => void (c.school.calendarName = v))}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Text label="First Day of School" type="date" value={school.firstDay} onChange={(v) => edit((c) => void (c.school.firstDay = v))} />
        <Text label="Last Day of School" type="date" value={school.lastDay} onChange={(v) => edit((c) => void (c.school.lastDay = v))} />
      </div>

      <div className="grid gap-2">
        <h3 className="text-sm font-semibold">Days Off and Early Dismissals</h3>
        {school.daysOff.length === 0 ? <p className="text-xs text-soft">None yet. Fill in a school year or add a day.</p> : null}
        {school.daysOff.map((d, i) => (
          <div key={`${i}-${d.start}`} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_1fr]">
            <Text label="Name" value={d.name} maxLength={60} onChange={(v) => edit((c) => void (c.school.daysOff[i]!.name = v))} />
            <Select
              label="What Happens"
              value={d.kind}
              options={KINDS}
              onChange={(v) => edit((c) => void (c.school.daysOff[i]!.kind = v))}
            />
            <Text
              label="From"
              type="date"
              value={d.start}
              onChange={(v) =>
                edit((c) => {
                  const x = c.school.daysOff[i]!;
                  if (x.end === x.start || x.end < v) x.end = v;
                  x.start = v;
                })
              }
            />
            <Text
              label="To (Same Day for One)"
              type="date"
              value={d.end}
              onChange={(v) => edit((c) => void (c.school.daysOff[i]!.end = v))}
            />
            <button
              type="button"
              className="btn-ghost justify-self-start text-bad"
              onClick={() => edit((c) => void c.school.daysOff.splice(i, 1))}
            >
              Remove
            </button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost"
            disabled={school.daysOff.length >= 80}
            onClick={() =>
              edit((c) => {
                const day = new Date().toISOString().slice(0, 10);
                c.school.daysOff.push({ start: day, end: day, name: "Pro-D Day", kind: "off" });
              })
            }
          >
            Add a Day Off
          </button>
          {school.daysOff.length > 1 ? (
            <button type="button" className="btn-ghost" onClick={() => edit((c) => void (c.school.daysOff = sortDays(c.school.daysOff)))}>
              Sort by Date
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-1">
        <h3 className="text-sm font-semibold">From a School Calendar Link</h3>
        {icals.length === 0 ? (
          <p className="text-xs text-soft">
            If your school publishes an iCal calendar, add it under Calendar links and switch it on here; its all-day Pro-D, No school and
            break events count as days off.
          </p>
        ) : (
          icals.map((l) => (
            <Toggle
              key={l.id}
              label={l.name || "Calendar Link"}
              checked={school.icalIds.includes(l.id)}
              onChange={(on) =>
                edit((c) => {
                  const ids = c.school.icalIds.filter((x) => x !== l.id);
                  c.school.icalIds = on ? [...ids, l.id].slice(0, 6) : ids;
                })
              }
            />
          ))
        )}
      </div>

      <div className="grid gap-2">
        <h3 className="text-sm font-semibold">Hot Lunch</h3>
        <p className="text-xs text-soft">The lunch on each school day, if your school has a weekly one. Leave a day empty for none.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {LUNCH_DAYS.map((day, i) => (
            <Text
              key={day}
              label={day}
              value={school.lunches[i] ?? ""}
              maxLength={60}
              placeholder={i === 0 ? "Pizza day" : ""}
              onChange={(v) => edit((c) => void (c.school.lunches[i] = v))}
            />
          ))}
        </div>
        <p className="text-xs text-soft">For a district menu on Nutrislice, use the School menu widget instead.</p>
      </div>
    </Section>
  );
}
