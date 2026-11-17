"use client";

import type { CountdownEvent, DashboardConfig, Widget } from "@/lib/config/schema";
import { WIDGETS } from "@/lib/config/widgets";

import { NumberInput, Select, Text, TextArea, Toggle } from "./fields";
import { newId } from "./store";

// Every widget's own settings (Melvin, 2026-11-17: "settings for every feature"). One form per widget type; each
// change is applied at once to the working copy and saved with the Save button.

export const TIME_ZONES = [
  { value: "America/Vancouver", label: "Vancouver" },
  { value: "America/Edmonton", label: "Edmonton" },
  { value: "America/Regina", label: "Regina" },
  { value: "America/Winnipeg", label: "Winnipeg" },
  { value: "America/Toronto", label: "Toronto" },
  { value: "America/Halifax", label: "Halifax" },
  { value: "America/St_Johns", label: "St. John's" },
  { value: "America/Los_Angeles", label: "Los Angeles" },
  { value: "America/New_York", label: "New York" },
  { value: "Pacific/Honolulu", label: "Honolulu" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Asia/Manila", label: "Manila" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Asia/Hong_Kong", label: "Hong Kong" },
  { value: "Australia/Sydney", label: "Sydney" },
  { value: "UTC", label: "UTC" },
] as const;

function zoneOptions(current: string) {
  return TIME_ZONES.some((z) => z.value === current) ? TIME_ZONES : [{ value: current, label: current }, ...TIME_ZONES];
}

export function WidgetSettings({
  widget,
  config,
  onChange,
}: {
  widget: Widget;
  config: DashboardConfig;
  onChange: (change: (w: Widget) => void) => void;
}) {
  const info = WIDGETS[widget.type];
  return (
    <div className="grid gap-4">
      <p className="text-sm text-soft">
        {info.icon} {info.description}
      </p>
      <Text
        label="Title"
        value={widget.title ?? ""}
        maxLength={60}
        placeholder="None"
        hint="A small heading above the widget."
        onChange={(v) =>
          onChange((w) => {
            if (v) w.title = v;
            else delete w.title;
          })
        }
      />
      <TypeSettings widget={widget} config={config} onChange={onChange} />
    </div>
  );
}

/** Edits a widget that the caller has already narrowed to one type. */
type Edit<T extends Widget["type"]> = (change: (w: Extract<Widget, { type: T }>) => void) => void;

function TypeSettings({
  widget: w,
  config,
  onChange,
}: {
  widget: Widget;
  config: DashboardConfig;
  onChange: (change: (w: Widget) => void) => void;
}) {
  // Each case narrows `w` by its type, so the edit function can be typed for that widget.
  const edit =
    <T extends Widget["type"]>(): Edit<T> =>
    (change) =>
      onChange((x) => change(x as Extract<Widget, { type: T }>));

  switch (w.type) {
    case "clock": {
      const e = edit<"clock">();
      return (
        <>
          <Select
            label="City"
            value={w.timeZone}
            options={zoneOptions(w.timeZone)}
            onChange={(v) =>
              e((x) => {
                // Follow the city name unless someone typed their own label.
                const old = TIME_ZONES.find((z) => z.value === x.timeZone)?.label;
                if (!x.label || x.label === old) x.label = TIME_ZONES.find((z) => z.value === v)?.label ?? x.label;
                x.timeZone = v;
              })
            }
          />
          <Text label="Label" value={w.label} maxLength={40} onChange={(v) => e((x) => void (x.label = v))} />
          <Select
            label="Style"
            value={w.style}
            options={[
              { value: "digital", label: "Digital" },
              { value: "analog", label: "Analog" },
            ]}
            onChange={(v) => e((x) => void (x.style = v))}
          />
          <Toggle label="Show seconds" checked={w.showSeconds} onChange={(v) => e((x) => void (x.showSeconds = v))} />
        </>
      );
    }
    case "date": {
      const e = edit<"date">();
      return (
        <>
          <Select
            label="Time zone"
            value={w.timeZone}
            options={zoneOptions(w.timeZone)}
            onChange={(v) => e((x) => void (x.timeZone = v))}
          />
          <Toggle label="Show the year" checked={w.showYear} onChange={(v) => e((x) => void (x.showYear = v))} />
        </>
      );
    }
    case "weather": {
      const e = edit<"weather">();
      return (
        <>
          <Toggle label="Show current conditions" checked={w.showCurrent} onChange={(v) => e((x) => void (x.showCurrent = v))} />
          <Toggle label="Show the next hours" checked={w.showHourly} onChange={(v) => e((x) => void (x.showHourly = v))} />
          <NumberInput label="Days ahead" value={w.days} min={0} max={7} onChange={(v) => e((x) => void (x.days = v))} />
          <p className="text-xs text-soft">Weather is for {config.location.name || "the dashboard's location"} (Settings).</p>
        </>
      );
    }
    case "airQuality": {
      const e = edit<"airQuality">();
      return (
        <Select
          label="Scale"
          value={w.scale}
          options={[
            { value: "aqhi", label: "AQHI (Canada, 1 to 10+)" },
            { value: "usAqi", label: "US AQI (0 to 500)" },
          ]}
          onChange={(v) => e((x) => void (x.scale = v))}
        />
      );
    }
    case "wifiQr": {
      const e = edit<"wifiQr">();
      return (
        <>
          <Text label="Network name" value={w.ssid} maxLength={32} onChange={(v) => e((x) => void (x.ssid = v))} />
          <Select
            label="Security"
            value={w.encryption}
            options={[
              { value: "WPA", label: "WPA / WPA2 / WPA3" },
              { value: "WEP", label: "WEP" },
              { value: "nopass", label: "None (open network)" },
            ]}
            onChange={(v) => e((x) => void (x.encryption = v))}
          />
          {w.encryption !== "nopass" && (
            <Text
              label="Password"
              type="password"
              value={w.password}
              maxLength={63}
              hint="Anyone who scans the code gets this password: that's the point. Use a guest network if you have one."
              onChange={(v) => e((x) => void (x.password = v))}
            />
          )}
          <Toggle label="Hidden network" checked={w.hidden} onChange={(v) => e((x) => void (x.hidden = v))} />
          <Toggle label="Show the password as text too" checked={w.showPassword} onChange={(v) => e((x) => void (x.showPassword = v))} />
        </>
      );
    }
    case "countdown": {
      const e = edit<"countdown">();
      return <CountdownEvents events={w.events} count={w.count} onChange={e} />;
    }
    case "agenda": {
      const e = edit<"agenda">();
      return (
        <>
          <Select
            label="Show"
            value={w.range}
            options={[
              { value: "today", label: "Today only" },
              { value: "upcoming", label: "The next few days" },
            ]}
            onChange={(v) => e((x) => void (x.range = v))}
          />
          {w.range === "upcoming" && (
            <NumberInput label="Days" value={w.days} min={1} max={14} onChange={(v) => e((x) => void (x.days = v))} />
          )}
          <p className="text-xs text-soft">Google Calendar is connected in a later update.</p>
        </>
      );
    }
    case "calendarMonth": {
      const e = edit<"calendarMonth">();
      return (
        <Select
          label="Weeks start on"
          value={String(w.weekStartsOn) as "0" | "1"}
          options={[
            { value: "0", label: "Sunday" },
            { value: "1", label: "Monday" },
          ]}
          onChange={(v) => e((x) => void (x.weekStartsOn = v === "1" ? 1 : 0))}
        />
      );
    }
    case "garbage": {
      const e = edit<"garbage">();
      return <NumberInput label="Weeks ahead" value={w.weeks} min={1} max={8} onChange={(v) => e((x) => void (x.weeks = v))} />;
    }
    case "photos": {
      const e = edit<"photos">();
      const sources = config.integrations.photos.sources;
      return (
        <>
          <NumberInput
            label="Seconds per photo"
            value={w.intervalSeconds}
            min={5}
            max={3600}
            onChange={(v) => e((x) => void (x.intervalSeconds = v))}
          />
          <Select
            label="Fit"
            value={w.fit}
            options={[
              { value: "cover", label: "Fill the space (crops edges)" },
              { value: "contain", label: "Show the whole photo" },
            ]}
            onChange={(v) => e((x) => void (x.fit = v))}
          />
          <Toggle label="Show captions" checked={w.showCaption} onChange={(v) => e((x) => void (x.showCaption = v))} />
          {sources.length === 0 ? (
            <p className="text-xs text-soft">Photo albums are connected in a later update.</p>
          ) : (
            sources.map((s) => (
              <Toggle
                key={s.id}
                label={s.name || "Album"}
                checked={w.sourceIds.includes(s.id)}
                onChange={(on) => e((x) => void (x.sourceIds = on ? [...x.sourceIds, s.id] : x.sourceIds.filter((id) => id !== s.id)))}
              />
            ))
          )}
        </>
      );
    }
    case "haEntity": {
      const e = edit<"haEntity">();
      return (
        <>
          <Text
            label="Entity"
            value={w.entityId}
            maxLength={255}
            placeholder="light.kitchen"
            onChange={(v) => e((x) => void (x.entityId = v.trim()))}
          />
          <Select
            label="Control"
            value={w.control}
            options={[
              { value: "auto", label: "Pick from the entity" },
              { value: "toggle", label: "On/off switch" },
              { value: "light", label: "Light with brightness" },
              { value: "sensor", label: "Reading" },
              { value: "climate", label: "Thermostat" },
              { value: "cover", label: "Blinds or garage door" },
              { value: "lock", label: "Lock" },
              { value: "button", label: "Button or scene" },
            ]}
            onChange={(v) => e((x) => void (x.control = v))}
          />
        </>
      );
    }
    case "note": {
      const e = edit<"note">();
      return (
        <>
          <TextArea label="Text" value={w.text} maxLength={2000} onChange={(v) => e((x) => void (x.text = v))} />
          <Select
            label="Size"
            value={w.size}
            options={[
              { value: "s", label: "Small" },
              { value: "m", label: "Medium" },
              { value: "l", label: "Large" },
              { value: "xl", label: "Huge" },
            ]}
            onChange={(v) => e((x) => void (x.size = v))}
          />
        </>
      );
    }
    case "messages": {
      const e = edit<"messages">();
      return (
        <>
          <NumberInput label="Notes shown" value={w.count} min={1} max={20} onChange={(v) => e((x) => void (x.count = v))} />
          <p className="text-xs text-soft">
            The family posts notes from their phones at <span className="font-mono">/family/</span> (Messages tab here).
          </p>
        </>
      );
    }
    case "alerts": {
      const e = edit<"alerts">();
      return (
        <Toggle label="Say “No alerts” when all is clear" checked={w.showAllClear} onChange={(v) => e((x) => void (x.showAllClear = v))} />
      );
    }
    case "camera": {
      const e = edit<"camera">();
      return (
        <>
          <Text
            label="Camera entity"
            value={w.entityId}
            maxLength={255}
            placeholder="camera.front_door"
            onChange={(v) => e((x) => void (x.entityId = v.trim()))}
          />
          <NumberInput
            label="Refresh every (seconds)"
            value={w.refreshSeconds}
            min={2}
            max={600}
            onChange={(v) => e((x) => void (x.refreshSeconds = v))}
          />
        </>
      );
    }
  }
}

function CountdownEvents({ events, count, onChange }: { events: CountdownEvent[]; count: number; onChange: Edit<"countdown"> }) {
  return (
    <>
      <NumberInput label="Events shown" value={count} min={1} max={12} onChange={(v) => onChange((x) => void (x.count = v))} />
      <div className="grid gap-3">
        {events.map((ev, i) => (
          <div key={ev.id} className="grid gap-2 rounded-xl border border-line p-3">
            <div className="grid grid-cols-[4rem_1fr] gap-2">
              <Text label="Emoji" value={ev.emoji} maxLength={8} onChange={(v) => onChange((x) => void (x.events[i]!.emoji = v))} />
              <Text label="Name" value={ev.name} maxLength={60} onChange={(v) => onChange((x) => void (x.events[i]!.name = v))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Text label="Date" type="date" value={ev.date} onChange={(v) => v && onChange((x) => void (x.events[i]!.date = v))} />
              <Select
                label="Kind"
                value={ev.kind}
                options={[
                  { value: "birthday", label: "Birthday" },
                  { value: "holiday", label: "Holiday" },
                  { value: "event", label: "Event" },
                ]}
                onChange={(v) => onChange((x) => void (x.events[i]!.kind = v))}
              />
            </div>
            <Toggle
              label="Every year"
              checked={ev.yearly}
              hint={ev.kind === "birthday" ? "For a birthday, use the date of birth to show the age they turn." : undefined}
              onChange={(v) => onChange((x) => void (x.events[i]!.yearly = v))}
            />
            <button
              type="button"
              className="btn-ghost justify-self-start text-bad"
              onClick={() => onChange((x) => void x.events.splice(i, 1))}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn-ghost"
        disabled={events.length >= 50}
        onClick={() =>
          onChange((x) => {
            x.events.push({
              id: newId("ev"),
              name: "Birthday",
              date: new Date().toISOString().slice(0, 10),
              emoji: "🎂",
              kind: "birthday",
              yearly: true,
            });
          })
        }
      >
        Add a date
      </button>
    </>
  );
}
