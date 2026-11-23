"use client";

import { useState } from "react";

import { CHORE_PERIODS, daysLabel, PERIOD_LABELS, WEEKDAYS, type ChorePeriod } from "@/lib/chores";
import type { Chore } from "@/lib/config/schema";

import { Colour, ConfirmButton, Range, Section, Select, Stepper, Text, Toggle } from "./fields";
import { newId, useAdmin } from "./store";

// The chore chart (Melvin, 2026-11-21): the kids, and the chores that come back on set weekdays, shared by everyone on
// them or taken in turns. Saved with the rest of the settings; ticks and stars are kept by the server
// (src/server/chores.ts).

const MAX_PEOPLE = 8;
const MAX_CHORES = 40;
const MAX_REWARDS = 12;
const COLOURS = ["#e8590c", "#1c7ed6", "#2f9e44", "#ae3ec9", "#f08c00", "#0ca678", "#d6336c", "#4263eb"];
const WEEK = [1, 2, 3, 4, 5, 6, 0];

const PERIODS: { value: ChorePeriod; label: string }[] = CHORE_PERIODS.map((value) => ({
  value,
  label: PERIOD_LABELS[value],
}));

const ROTATIONS: { value: Chore["rotate"]; label: string }[] = [
  { value: "none", label: "Everyone picked does it" },
  { value: "day", label: "Take turns, each time it's due" },
  { value: "week", label: "Take turns, a week each" },
];

function Chips({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string, on: boolean) => void;
}) {
  return (
    <fieldset className="grid gap-1">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              className={`min-h-9 rounded-full border px-3 text-sm ${on ? "border-brand bg-brand text-white" : "border-line"}`}
              onClick={() => onToggle(o.value, !on)}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ChoresPanel() {
  const { people, items, rewards, pinSet } = useAdmin((s) => s.config.chores);
  const edit = useAdmin((s) => s.edit);
  const [kid, setKid] = useState("");
  const [chore, setChore] = useState("");
  const [reward, setReward] = useState("");
  const [pinDraft, setPinDraft] = useState("");
  const [pinMsg, setPinMsg] = useState("");

  function changePerson(id: string, patch: { name?: string; emoji?: string; color?: string; goal?: number }) {
    edit((c) => {
      const p = c.chores.people.find((x) => x.id === id);
      if (p) Object.assign(p, patch);
    });
  }
  function changeChore(id: string, change: (c: Chore) => void) {
    edit((c) => {
      const x = c.chores.items.find((i) => i.id === id);
      if (x) change(x);
    });
  }

  return (
    <Section title="Chores">
      <p className="text-sm text-soft">
        The kids&rsquo; chore chart. Chores come back on the days you pick, for everyone on them or in turns, and each tick on the wall
        earns its stars for the week (weeks start on Monday).
      </p>

      <h3 className="text-sm font-semibold">Kids</h3>
      {people.map((p) => (
        <div key={p.id} className="grid gap-2 rounded-xl border border-line p-3">
          <div className="grid grid-cols-[4rem_1fr] gap-3">
            <Text label="Icon" value={p.emoji} maxLength={8} placeholder="🦊" onChange={(v) => changePerson(p.id, { emoji: v })} />
            <Text label="Name" value={p.name} maxLength={30} onChange={(v) => changePerson(p.id, { name: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Colour label="Colour" value={p.color} onChange={(v) => changePerson(p.id, { color: v })} />
            <Range
              label="Weekly star goal"
              value={p.goal}
              min={0}
              max={500}
              step={1}
              format={(n) => (n === 0 ? "None" : String(n))}
              hint="0 for none."
              onChange={(v) => changePerson(p.id, { goal: v })}
            />
          </div>
          <ConfirmButton
            label="Remove"
            onConfirm={() =>
              edit((c) => {
                c.chores.people = c.chores.people.filter((x) => x.id !== p.id);
                // Their chores go to the others; a chore nobody is left on goes too.
                for (const i of c.chores.items) i.personIds = i.personIds.filter((x) => x !== p.id);
                c.chores.items = c.chores.items.filter((i) => i.personIds.length > 0);
                for (const v of c.views)
                  for (const w of v.widgets) if (w.type === "chores") w.personIds = w.personIds.filter((x) => x !== p.id);
              })
            }
          />
        </div>
      ))}
      {people.length < MAX_PEOPLE && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = kid.trim();
            if (!name) return;
            edit((c) => {
              if (c.chores.people.length >= MAX_PEOPLE) return;
              const color = COLOURS[c.chores.people.length % COLOURS.length] ?? "#1c7ed6";
              c.chores.people.push({ id: newId("kid"), name, emoji: "", color, goal: 0 });
            });
            setKid("");
          }}
        >
          <div className="min-w-0 flex-1">
            <Text label="Add a kid" value={kid} maxLength={30} placeholder="Name" onChange={setKid} />
          </div>
          <button className="btn-primary" disabled={!kid.trim()}>
            Add
          </button>
        </form>
      )}

      <h3 className="text-sm font-semibold">Chores</h3>
      {people.length === 0 && <p className="text-xs text-soft">Add a kid first.</p>}
      {items.map((i) => (
        <div key={i.id} className="grid gap-3 rounded-xl border border-line p-3">
          <div className="grid grid-cols-[4rem_1fr_5rem] gap-3">
            <Text
              label="Icon"
              value={i.emoji}
              maxLength={8}
              placeholder="🛏️"
              onChange={(v) => changeChore(i.id, (x) => void (x.emoji = v))}
            />
            <Text label="Chore" value={i.name} maxLength={40} onChange={(v) => changeChore(i.id, (x) => void (x.name = v))} />
            <Stepper label="Stars" value={i.stars} min={1} max={5} onChange={(v) => changeChore(i.id, (x) => void (x.stars = v))} />
          </div>
          <Chips
            label={`Days: ${daysLabel(i.days)}`}
            options={WEEK.map((d) => ({ value: String(d), label: WEEKDAYS[d] ?? "" }))}
            selected={i.days.map(String)}
            onToggle={(v, on) =>
              changeChore(i.id, (x) => {
                const d = Number(v);
                // A chore keeps at least one day; take it off the chart with Remove instead.
                if (on) x.days = [...x.days, d];
                else if (x.days.length > 1) x.days = x.days.filter((y) => y !== d);
              })
            }
          />
          <Chips
            label="Who"
            options={people.map((p) => ({ value: p.id, label: `${p.emoji} ${p.name}`.trim() }))}
            selected={i.personIds}
            onToggle={(v, on) =>
              changeChore(i.id, (x) => {
                if (on) x.personIds = [...x.personIds, v];
                else if (x.personIds.length > 1) x.personIds = x.personIds.filter((y) => y !== v);
              })
            }
          />
          <Select label="Time of day" value={i.period} options={PERIODS} onChange={(v) => changeChore(i.id, (x) => void (x.period = v))} />
          {i.personIds.length > 1 && (
            <Select label="How" value={i.rotate} options={ROTATIONS} onChange={(v) => changeChore(i.id, (x) => void (x.rotate = v))} />
          )}
          <ConfirmButton
            label="Remove"
            onConfirm={() => edit((c) => void (c.chores.items = c.chores.items.filter((x) => x.id !== i.id)))}
          />
        </div>
      ))}
      {people.length > 0 && items.length < MAX_CHORES && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = chore.trim();
            if (!name) return;
            edit((c) => {
              if (c.chores.items.length >= MAX_CHORES) return;
              c.chores.items.push({
                id: newId("chore"),
                name,
                emoji: "",
                stars: 1,
                days: [0, 1, 2, 3, 4, 5, 6],
                personIds: c.chores.people.map((p) => p.id),
                rotate: c.chores.people.length > 1 ? "day" : "none",
                period: "anytime",
              });
            });
            setChore("");
          }}
        >
          <div className="min-w-0 flex-1">
            <Text label="Add a chore" value={chore} maxLength={40} placeholder="Make the bed, feed the cat…" onChange={setChore} />
          </div>
          <button className="btn-primary" disabled={!chore.trim()}>
            Add
          </button>
        </form>
      )}
      <p className="text-xs text-soft">Save to send the change to your displays. Changing who is on a rotation starts the turns over.</p>

      <h3 className="text-sm font-semibold">Star rewards</h3>
      <p className="text-xs text-soft">Kids redeem these on the wall when they have enough stars this week (Monday to Sunday).</p>
      {rewards.map((r) => (
        <div key={r.id} className="grid grid-cols-[1fr_6rem] gap-3 rounded-xl border border-line p-3">
          <Text
            label="Reward"
            value={r.name}
            maxLength={40}
            onChange={(v) => edit((c) => void (c.chores.rewards.find((x) => x.id === r.id)!.name = v))}
          />
          <Stepper
            label="Stars"
            value={r.starsCost}
            min={1}
            max={500}
            onChange={(v) => edit((c) => void (c.chores.rewards.find((x) => x.id === r.id)!.starsCost = v))}
          />
          <ConfirmButton
            label="Remove"
            onConfirm={() => edit((c) => void (c.chores.rewards = c.chores.rewards.filter((x) => x.id !== r.id)))}
          />
        </div>
      ))}
      {rewards.length < MAX_REWARDS && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = reward.trim();
            if (!name) return;
            edit((c) => {
              if (c.chores.rewards.length >= MAX_REWARDS) return;
              c.chores.rewards.push({ id: newId("reward"), name, starsCost: 10 });
            });
            setReward("");
          }}
        >
          <div className="min-w-0 flex-1">
            <Text label="Add a reward" value={reward} maxLength={40} placeholder="Extra screen time…" onChange={setReward} />
          </div>
          <button className="btn-primary" disabled={!reward.trim()}>
            Add
          </button>
        </form>
      )}

      <h3 className="text-sm font-semibold">Child PIN</h3>
      <p className="text-xs text-soft">
        Optional four-digit PIN. When set, kids need it to untick a chore or redeem a reward. Ticking chores on stays open.
      </p>
      <Toggle
        label="PIN required on the wall"
        checked={pinSet}
        hint="Turn off after clearing the PIN below. Save after changing this."
        onChange={(v) => edit((c) => void (c.chores.pinSet = v))}
      />
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPinMsg("");
          void (async () => {
            const pin = pinDraft.trim();
            if (pin && !/^\d{4}$/.test(pin)) return setPinMsg("PIN must be four digits.");
            const r = await fetch("/api/household/chores/pin/", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pin: pin || null }),
            });
            if (!r.ok) return setPinMsg("Couldn't save the PIN.");
            edit((c) => {
              c.chores.pinSet = Boolean(pin);
            });
            setPinDraft("");
            setPinMsg(pin ? "PIN saved. Press Save to update displays." : "PIN cleared.");
          })();
        }}
      >
        <Text label="New PIN" value={pinDraft} maxLength={4} placeholder="1234" onChange={setPinDraft} />
        <button className="btn-primary" type="submit">
          {pinDraft ? "Set PIN" : "Clear PIN"}
        </button>
      </form>
      {pinMsg && (
        <p className="text-sm" role="status">
          {pinMsg}
        </p>
      )}
    </Section>
  );
}
