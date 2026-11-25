"use client";

import { useState, type ReactNode } from "react";

import { PERIOD_LABELS, PERIODS } from "@/lib/config/periods";
import type { CountdownEvent, DashboardConfig, TimerPreset, Widget } from "@/lib/config/schema";
import { WIDGETS } from "@/lib/config/widgets";
import { EARTH_OVERLAY_LABELS, EARTH_OVERLAYS, EARTH_ZOOM_LABELS, EARTH_ZOOMS } from "@/lib/earth";
import { FERRY_ROUTES, ferryRouteName } from "@/lib/ferries";
import { MEAL_LABELS, MEAL_SLOTS } from "@/lib/meals";
import { WINDY_OVERLAY_LABELS, WINDY_OVERLAYS, windyPressureAllowed } from "@/lib/windy";

import { PlaceFinder } from "./CommutePanel";
import { useEcoFlow } from "./EcoFlowPanel";
import { Range, Segmented, Select, Stepper, Text, TextArea, Toggle } from "./fields";
import { HaEntityList, useHa } from "./haEntities";
import { useMusic } from "./music";
import { newId } from "./store";
import { UnifiSitePicker } from "./UnifiPanel";

// Every widget's own settings (Melvin, 2026-11-17: "settings for every feature"). One form per widget type; each
// change is applied at once to the working copy and saved with the Save button. Bounded numbers use Range/Stepper
// (Melvin, 2026-11-22 admin UX).

function SettingsLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="font-medium text-brand underline-offset-2 hover:underline" href={href}>
      {children}
    </a>
  );
}

const PHOTO_INTERVALS = [
  { value: "10", label: "10 s" },
  { value: "30", label: "30 s" },
  { value: "60", label: "1 min" },
  { value: "300", label: "5 min" },
  { value: "custom", label: "Custom" },
] as const;

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

// The month calendar shows the whole month, or 1 to 6 weeks starting with this one (Melvin, 2026-11-21).
type WeeksChoice = "month" | "1" | "2" | "3" | "4" | "5" | "6";
const WEEKS_OPTIONS: { value: WeeksChoice; label: string }[] = [
  { value: "month", label: "The whole month" },
  ...(["1", "2", "3", "4", "5", "6"] as const).map((n) => ({ value: n, label: n === "1" ? "This week" : `${n} weeks from this one` })),
];

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
  // Type-specific controls first; shared panel chrome last (W1, 2026-11-24) so the drawer leads with what this widget does.
  return (
    <div className="grid gap-4">
      <p className="text-sm text-soft">
        {info.icon} {info.description}
      </p>
      {info.supportsTitle !== false && (
        <Text
          label="Title"
          value={widget.title ?? ""}
          maxLength={60}
          placeholder="None"
          hint="Optional heading on the wall."
          onChange={(v) =>
            onChange((w) => {
              if (v) w.title = v;
              else delete w.title;
            })
          }
        />
      )}
      <TypeSettings widget={widget} config={config} onChange={onChange} />
      <details className="grid gap-4 border-t border-line pt-4">
        <summary className="cursor-pointer text-xs font-semibold tracking-wide text-soft uppercase">Looks &amp; schedule</summary>
        <PanelBackground widget={widget} config={config} onChange={onChange} />
        {info.supportsFontScale !== false && <FontScale widget={widget} onChange={onChange} />}
        <VisiblePeriods widget={widget} onChange={onChange} />
      </details>
    </div>
  );
}

function VisiblePeriods({ widget, onChange }: { widget: Widget; onChange: (change: (w: Widget) => void) => void }) {
  const picked = widget.visiblePeriods ?? [];
  return (
    <fieldset className="grid gap-1">
      <legend className="mb-1 text-sm font-medium">Show during</legend>
      <p className="text-xs text-soft">
        Leave every period off to show all day. Picking one or more hides it outside those parts of the day.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {PERIODS.map((p) => {
          const on = picked.includes(p);
          return (
            <button
              key={p}
              type="button"
              aria-pressed={on}
              className={`min-h-11 rounded-full border px-3 text-sm ${on ? "border-brand bg-brand text-white" : "border-line"}`}
              onClick={() =>
                onChange((w) => {
                  const cur = w.visiblePeriods ?? [];
                  w.visiblePeriods = on ? (cur.filter((x) => x !== p).length ? cur.filter((x) => x !== p) : undefined) : [...cur, p];
                  if (w.visiblePeriods && w.visiblePeriods.length === 0) delete w.visiblePeriods;
                })
              }
            >
              {PERIOD_LABELS[p]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Background on/off, opacity and outer padding for every widget (Melvin, 2026-11-22 / 2026-11-23). Opacity falls back to the theme's widget background. */
function PanelBackground({
  widget,
  config,
  onChange,
}: {
  widget: Widget;
  config: DashboardConfig;
  onChange: (change: (w: Widget) => void) => void;
}) {
  const themeOpacity = config.themes.find((t) => t.id === config.themeId)?.surfaceOpacity ?? config.themes[0]?.surfaceOpacity ?? 0.72;
  return (
    <>
      <Toggle
        label="Background"
        checked={widget.showBackground}
        hint="Panel behind the content. Turn off when this tile sits on a photos backdrop."
        onChange={(v) => onChange((w) => void (w.showBackground = v))}
      />
      {widget.showBackground ? (
        <Range
          label="Background opacity"
          value={widget.backgroundOpacity ?? themeOpacity}
          min={0}
          max={1}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          hint={widget.backgroundOpacity == null ? "Using the colour scheme’s panel opacity until you move the slider." : undefined}
          onChange={(v) => onChange((w) => void (w.backgroundOpacity = v))}
        />
      ) : null}
      <Range
        label="Outer padding"
        value={widget.outerPadding ?? 0}
        min={0}
        max={48}
        step={1}
        format={(n) => `${n} px`}
        hint="Inset from the grid cell edge. View › Tile is padding inside the panel."
        onChange={(v) =>
          onChange((w) => {
            if (v) w.outerPadding = v;
            else delete w.outerPadding;
          })
        }
      />
    </>
  );
}

/** Text size for widgets that show copy (Melvin, 2026-11-23). Media-fill tiles omit this control. */
function FontScale({ widget, onChange }: { widget: Widget; onChange: (change: (w: Widget) => void) => void }) {
  return (
    <Range
      label="Font size"
      value={widget.fontScale ?? 1}
      min={0.7}
      max={1.5}
      step={0.05}
      format={(v) => `${Math.round(v * 100)}%`}
      hint="Scales the text in this tile only."
      onChange={(v) =>
        onChange((w) => {
          if (v === 1) delete w.fontScale;
          else w.fontScale = v;
        })
      }
    />
  );
}

/** Edits a widget that the caller has already narrowed to one type. */
type Edit<T extends Widget["type"]> = (change: (w: Extract<Widget, { type: T }>) => void) => void;

/** Recognition-first smart device setup (critique P1, 2026-11-24): pick a named entity, Control under Advanced. */
function HaEntitySettings({
  widget: w,
  provider,
  onEdit: e,
}: {
  widget: Extract<Widget, { type: "haEntity" }>;
  provider: NonNullable<Extract<Widget, { type: "haEntity" }>["provider"]> | "homeAssistant";
  onEdit: Edit<"haEntity">;
}) {
  const ha = useHa();
  const entities = ha?.entities ?? [];
  const picked = entities.some((ent) => ent.id === w.entityId);

  return (
    <>
      <Select
        label="Provider"
        value={provider}
        options={[
          { value: "homeAssistant", label: "Home Assistant" },
          { value: "nest", label: "Nest" },
          { value: "ecobee", label: "ecobee" },
          { value: "smartthings", label: "SmartThings" },
        ]}
        onChange={(v) => e((x) => void (x.provider = v))}
      />
      {provider === "homeAssistant" && entities.length > 0 ? (
        <Select
          label="Device"
          value={picked ? w.entityId : ""}
          options={[
            { value: "", label: "Choose a device…" },
            ...entities.map((ent) => ({ value: ent.id, label: ent.name && ent.name !== ent.id ? `${ent.name} (${ent.id})` : ent.id })),
          ]}
          onChange={(v) => e((x) => void (x.entityId = v))}
          hint="Names from your Home Assistant. Pick one instead of typing an entity id."
        />
      ) : null}
      <Text
        label={provider === "homeAssistant" && entities.length > 0 ? "Or paste entity id" : "Entity"}
        value={w.entityId}
        maxLength={255}
        placeholder={provider === "homeAssistant" ? "light.kitchen" : `${provider}.device_id`}
        list={provider === "homeAssistant" ? "ha-controls" : undefined}
        onChange={(v) => e((x) => void (x.entityId = v.trim()))}
      />
      {provider === "homeAssistant" ? (
        <HaEntityList id="ha-controls" />
      ) : (
        <p className="text-sm text-soft">
          Connect {provider} under <SettingsLink href="#settings/smart-home">Settings › Smart home</SettingsLink>, then paste a device id
          from the list (e.g. {provider}.living_room).
        </p>
      )}
      <details className="grid gap-3 rounded-xl border border-line bg-bg px-3 py-2" open={w.control !== "auto"}>
        <summary className="cursor-pointer text-sm font-semibold text-ink">Advanced control type</summary>
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
          hint="Leave on Auto unless the wall shows the wrong kind of control."
        />
      </details>
    </>
  );
}

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
              { value: "analog", label: "Analogue" },
              { value: "flip", label: "Flip" },
              { value: "nixie", label: "Nixie" },
              { value: "word", label: "Word" },
              { value: "minimal", label: "Minimal" },
              { value: "neon", label: "Neon" },
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
    case "sunTimes": {
      const e = edit<"sunTimes">();
      return (
        <>
          <Toggle
            label="Show emoji"
            checked={w.showEmoji}
            hint="The sunrise and sunset icons, and the sun on the daylight line."
            onChange={(v) => e((x) => void (x.showEmoji = v))}
          />
          <Toggle
            label="Show hours of daylight"
            checked={w.showDaylight}
            hint="The line under the times, like “8 hr 51 min of daylight”."
            onChange={(v) => e((x) => void (x.showDaylight = v))}
          />
          <p className="text-xs text-soft">Times are for {config.location.name || "the dashboard's location"} (Settings).</p>
        </>
      );
    }
    case "weather": {
      const e = edit<"weather">();
      return (
        <>
          <Toggle label="Show current conditions" checked={w.showCurrent} onChange={(v) => e((x) => void (x.showCurrent = v))} />
          <Toggle label="Show the next hours" checked={w.showHourly} onChange={(v) => e((x) => void (x.showHourly = v))} />
          <Toggle label="Show the UV index" checked={w.showUv} onChange={(v) => e((x) => void (x.showUv = v))} />
          <Toggle
            label="Show pollen"
            checked={w.showPollen}
            hint="The highest count Open-Meteo reports. Often missing in North America."
            onChange={(v) => e((x) => void (x.showPollen = v))}
          />
          <Stepper label="Days ahead" value={w.days} min={0} max={7} onChange={(v) => e((x) => void (x.days = v))} />
          <p className="text-xs text-soft">
            Forecast from {(config.weather?.provider ?? "openMeteo") === "environmentCanada" ? "Environment Canada" : "Open-Meteo"} for{" "}
            {config.location.name || "the dashboard's location"} (<SettingsLink href="#settings/location">Settings › Location</SettingsLink>
            ).
          </p>
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
    case "editQr":
      return (
        <p className="text-sm text-soft">
          Encodes this display&apos;s <code className="text-xs">/d/…/edit/</code> link. Anyone who scans it can change the meal plan,
          shopping list and message board with no sign-in. The same link is under Displays.
        </p>
      );
    case "countdown": {
      const e = edit<"countdown">();
      return <CountdownEvents events={w.events} count={w.count} onChange={e} />;
    }
    case "calendarWeek": {
      const e = edit<"calendarWeek">();
      return (
        <>
          <Select
            label="Week starts on"
            value={String(w.weekStartsOn)}
            options={[
              { value: "0", label: "Sunday" },
              { value: "1", label: "Monday" },
            ]}
            onChange={(v) => e((x) => void (x.weekStartsOn = Number(v) as 0 | 1))}
          />
          <Toggle label="Show weekends" checked={w.showWeekends} onChange={(v) => e((x) => void (x.showWeekends = v))} />
        </>
      );
    }
    case "calendarUpNext": {
      const e = edit<"calendarUpNext">();
      return <Stepper label="Also show next" value={w.count} min={1} max={10} onChange={(v) => e((x) => void (x.count = v))} />;
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
          {w.range === "upcoming" && <Stepper label="Days" value={w.days} min={1} max={14} onChange={(v) => e((x) => void (x.days = v))} />}
          <p className="text-xs text-soft">
            Connect calendars under <SettingsLink href="#settings/google">Settings › Google Calendar</SettingsLink> or{" "}
            <SettingsLink href="#settings/icals">Calendar links</SettingsLink>. Family events come from{" "}
            <span className="font-mono">/family/</span>.
          </p>
        </>
      );
    }
    case "calendarMonth": {
      const e = edit<"calendarMonth">();
      return (
        <>
          <Select
            label="Weeks start on"
            value={String(w.weekStartsOn) as "0" | "1"}
            options={[
              { value: "0", label: "Sunday" },
              { value: "1", label: "Monday" },
            ]}
            onChange={(v) => e((x) => void (x.weekStartsOn = v === "1" ? 1 : 0))}
          />
          <Select
            label="Show"
            value={w.weeks === undefined ? "month" : (String(w.weeks) as WeeksChoice)}
            options={WEEKS_OPTIONS}
            onChange={(v) =>
              e((x) => {
                if (v === "month") delete x.weeks;
                else x.weeks = Number(v);
              })
            }
          />
          <Toggle label="Show weekends" checked={w.showWeekends} onChange={(v) => e((x) => void (x.showWeekends = v))} />
          <Toggle label="Show the month title" checked={w.showTitle} onChange={(v) => e((x) => void (x.showTitle = v))} />
          <Toggle
            label="Open day details when tapped"
            checked={w.showDayDetails}
            onChange={(v) => e((x) => void (x.showDayDetails = v))}
            hint="See every event for that day, including events hidden behind “+N more”."
          />
          <details className="grid gap-3 rounded-xl border border-line bg-bg px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-ink">Advanced layout</summary>
            <Toggle
              label="Fit event titles"
              checked={w.fitTitles}
              onChange={(v) => e((x) => void (x.fitTitles = v))}
              hint="Wrap titles (and shrink if needed) so they are not cut off with an ellipsis. Busy days still show “+N more”."
            />
            <Stepper
              label="Scroll after"
              value={w.scrollWeeks}
              min={1}
              max={6}
              format={(n) => `${n} week${n === 1 ? "" : "s"}`}
              onChange={(v) => e((x) => void (x.scrollWeeks = v))}
              hint="When the calendar shows more weeks than this, each week keeps that height and you can scroll the rest."
            />
          </details>
        </>
      );
    }
    case "garbage": {
      const e = edit<"garbage">();
      return <Stepper label="Weeks ahead" value={w.weeks} min={1} max={8} onChange={(v) => e((x) => void (x.weeks = v))} />;
    }
    case "commute": {
      const e = edit<"commute">();
      const places = config.integrations.commute.destinations;
      return (
        <>
          <Toggle label="Show arrival time" checked={w.showArrival} onChange={(v) => e((x) => void (x.showArrival = v))} />
          <Toggle label="Show distance" checked={w.showDistance} onChange={(v) => e((x) => void (x.showDistance = v))} />
          {places.length === 0 ? (
            <p className="text-xs text-soft">
              Add home and the places to drive to under <SettingsLink href="#settings/commute">Settings › Commute</SettingsLink>.
            </p>
          ) : (
            <>
              <p className="text-xs text-soft">Pick the places to show. With none picked, it shows them all.</p>
              {places.map((p) => (
                <Toggle
                  key={p.id}
                  label={`${p.emoji} ${p.name}`.trim()}
                  checked={w.destinationIds.includes(p.id)}
                  onChange={(on) =>
                    e((x) => void (x.destinationIds = on ? [...x.destinationIds, p.id] : x.destinationIds.filter((id) => id !== p.id)))
                  }
                />
              ))}
            </>
          )}
        </>
      );
    }
    case "radar": {
      const e = edit<"radar">();
      const minutes = (list: number[], none?: string) =>
        list.map((m) => ({
          value: String(m),
          label: m === 0 && none ? none : m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? "s" : ""}`,
        }));
      return (
        <>
          <Select
            label="Show"
            value={w.precip}
            options={[
              { value: "rain", label: "Rain" },
              { value: "snow", label: "Snow" },
            ]}
            onChange={(v) => e((x) => void (x.precip = v))}
          />
          <Select
            label="Map area"
            value={String(w.zoom)}
            options={[
              { value: "6", label: "Southern B.C." },
              { value: "7", label: "South coast" },
              { value: "8", label: "Lower Mainland" },
              { value: "9", label: "Fraser Valley" },
              { value: "10", label: "Close to home" },
            ]}
            onChange={(v) => e((x) => void (x.zoom = Number(v)))}
            hint="The map is centred on the dashboard's location (Settings)."
          />
          <Select
            label="Radar from the past"
            value={String(w.pastMinutes)}
            options={minutes([30, 60, 90, 120, 180])}
            onChange={(v) => e((x) => void (x.pastMinutes = Number(v)))}
          />
          <Select
            label="Forecast ahead"
            value={String(w.forecastMinutes)}
            options={minutes([0, 30, 60, 120, 180], "No forecast")}
            onChange={(v) => e((x) => void (x.forecastMinutes = Number(v)))}
            hint="Environment Canada's extrapolation of where the rain is moving."
          />
          <Toggle label="Animate" checked={w.animate} onChange={(v) => e((x) => void (x.animate = v))} />
        </>
      );
    }
    case "earth": {
      const e = edit<"earth">();
      const home = config.location;
      const atHome = w.latitude === home.latitude && w.longitude === home.longitude;
      return (
        <>
          <div className="grid gap-1">
            <p className="text-sm font-medium">Centred on</p>
            <p className="text-sm">
              {w.place || "A place"} ({w.latitude.toFixed(2)}, {w.longitude.toFixed(2)})
            </p>
            {!atHome && (
              <button
                type="button"
                className="btn-ghost justify-start"
                onClick={() =>
                  e((x) => {
                    x.place = home.name.slice(0, 80);
                    x.latitude = home.latitude;
                    x.longitude = home.longitude;
                  })
                }
              >
                Use the dashboard&rsquo;s location{home.name ? ` (${home.name})` : ""}
              </button>
            )}
          </div>
          <PlaceFinder
            label="Another place"
            button="Find"
            placeholder="Town or city, anywhere"
            nothing="Nothing matched. Try a town or city name, like \u201cManila\u201d."
            url={(q) => `/api/household/places/?${new URLSearchParams({ q })}`}
            onPick={(p) =>
              e((x) => {
                x.place = p.label.slice(0, 80);
                x.latitude = p.latitude;
                x.longitude = p.longitude;
              })
            }
          />
          <Select
            label="How far out"
            value={w.zoom}
            options={EARTH_ZOOMS.map((z) => ({ value: z, label: EARTH_ZOOM_LABELS[z] }))}
            onChange={(v) => e((x) => void (x.zoom = v))}
            hint="Worked out from the widget's size, so a small widget shows the same area as a big one."
          />
          {(() => {
            const primary = ["wind", "temp", "precip_3hr", "relative_humidity"] as const;
            const isPrimary = (primary as readonly string[]).includes(w.overlay);
            return (
              <>
                <Select
                  label="Colours show"
                  value={isPrimary ? w.overlay : w.overlay}
                  options={[
                    ...primary.map((o) => ({ value: o, label: EARTH_OVERLAY_LABELS[o] })),
                    ...(!isPrimary ? [{ value: w.overlay, label: EARTH_OVERLAY_LABELS[w.overlay] }] : []),
                  ]}
                  onChange={(v) => e((x) => void (x.overlay = v))}
                />
                <details className="rounded-xl border border-line bg-bg px-3 py-2" open={!isPrimary}>
                  <summary className="cursor-pointer text-sm font-semibold text-ink">More colour layers</summary>
                  <div className="mt-3">
                    <Select
                      label="Layer"
                      value={w.overlay}
                      options={EARTH_OVERLAYS.filter((o) => !(primary as readonly string[]).includes(o)).map((o) => ({
                        value: o,
                        label: EARTH_OVERLAY_LABELS[o],
                      }))}
                      onChange={(v) => e((x) => void (x.overlay = v))}
                    />
                  </div>
                </details>
              </>
            );
          })()}
          <Toggle
            label="Mark the place"
            checked={w.showPlace}
            hint="A ring on the map, with a small card of its wind and the reading for the colours."
            onChange={(v) => e((x) => void (x.showPlace = v))}
          />
          <Toggle
            label="Animate the wind"
            checked={w.animate}
            hint="The moving lines are the heaviest thing on the screen. Off draws a still map."
            onChange={(v) => e((x) => void (x.animate = v))}
          />
          <p className="text-xs text-soft">
            The map is earth.nullschool.net by Cameron Beccario, shown as it is on that site. It is hidden while the screen saver is on,
            loads again every hour for new weather, and doesn&rsquo;t respond to touch on the wall. The place is sent to
            earth.nullschool.net rounded to about a kilometre.
          </p>
        </>
      );
    }
    case "windy": {
      const e = edit<"windy">();
      const home = config.location;
      const atHome = w.latitude === home.latitude && w.longitude === home.longitude;
      return (
        <>
          <div className="grid gap-1">
            <p className="text-sm font-medium">Centred on</p>
            <p className="text-sm">
              {w.place || "A place"} ({w.latitude.toFixed(2)}, {w.longitude.toFixed(2)})
            </p>
            {!atHome && (
              <button
                type="button"
                className="btn-ghost justify-start"
                onClick={() =>
                  e((x) => {
                    x.place = home.name.slice(0, 80);
                    x.latitude = home.latitude;
                    x.longitude = home.longitude;
                  })
                }
              >
                Use the dashboard&rsquo;s location{home.name ? ` (${home.name})` : ""}
              </button>
            )}
          </div>
          <PlaceFinder
            label="Another place"
            button="Find"
            placeholder="Town or city, anywhere"
            nothing="Nothing matched. Try a town or city name, like \u201cManila\u201d."
            url={(q) => `/api/household/places/?${new URLSearchParams({ q })}`}
            onPick={(p) =>
              e((x) => {
                x.place = p.label.slice(0, 80);
                x.latitude = p.latitude;
                x.longitude = p.longitude;
              })
            }
          />
          <Select
            label="Layer"
            value={w.overlay}
            options={WINDY_OVERLAYS.map((o) => ({ value: o, label: WINDY_OVERLAY_LABELS[o] }))}
            onChange={(v) => e((x) => void (x.overlay = v))}
          />
          <Select
            label="Map area"
            value={String(w.zoom)}
            options={[
              { value: "3", label: "North America" },
              { value: "4", label: "Western Canada and the U.S." },
              { value: "5", label: "B.C. and Washington" },
              { value: "6", label: "Southern B.C." },
              { value: "7", label: "South coast" },
              { value: "8", label: "Lower Mainland" },
              { value: "9", label: "Fraser Valley" },
              { value: "10", label: "Close to home" },
              { value: "11", label: "The neighbourhood" },
            ]}
            onChange={(v) => e((x) => void (x.zoom = Number(v)))}
          />
          <Toggle label="Mark the place" checked={w.marker} onChange={(v) => e((x) => void (x.marker = v))} />
          {windyPressureAllowed(w.overlay) && (
            <Toggle label="Pressure lines" checked={w.pressure} onChange={(v) => e((x) => void (x.pressure = v))} />
          )}
          <Toggle
            label="Let people move the map"
            checked={w.interactive}
            onChange={(v) => e((x) => void (x.interactive = v))}
            hint="Off, a tap can't pan or zoom it away from the place. On, touches on the map don't count as using the screen for the screen saver."
          />
          <p className="text-xs text-soft">
            The map is Windy&rsquo;s own (windy.com), in {config.units === "metric" ? "°C, km/h and mm" : "°F, mph and inches"} from
            Settings. It is hidden while the screen saver is on and loads again every half hour. It is heavier than the other widgets, so
            one per view is plenty. The place is sent to Windy rounded to about a kilometre.
          </p>
        </>
      );
    }
    case "ferries": {
      const e = edit<"ferries">();
      return (
        <>
          <Stepper label="Sailings per route" value={w.count} min={1} max={8} onChange={(v) => e((x) => void (x.count = v))} />
          <Toggle label="Show the ship's name" checked={w.showVessel} onChange={(v) => e((x) => void (x.showVessel = v))} />
          <p className="text-xs text-soft">Pick up to four routes. These are the ones BC Ferries says how full they are for.</p>
          {FERRY_ROUTES.map((code) => (
            <Toggle
              key={code}
              label={ferryRouteName(code)}
              checked={w.routes.includes(code)}
              onChange={(on) =>
                e((x) => {
                  const next = on ? [...x.routes, code] : x.routes.filter((c) => c !== code);
                  // At least one route, at most four (the schema refuses anything else).
                  if (next.length >= 1 && next.length <= 4) x.routes = next;
                })
              }
            />
          ))}
        </>
      );
    }
    case "sports": {
      const e = edit<"sports">();
      const teams = config.integrations.sports.teams;
      return (
        <>
          <Toggle
            label="Show the last result"
            checked={w.showLast}
            hint="Next to the next game, when no game is on."
            onChange={(v) => e((x) => void (x.showLast = v))}
          />
          {teams.length === 0 ? (
            <p className="text-xs text-soft">
              Pick the teams to follow under <SettingsLink href="#settings/sports">Settings › Sports</SettingsLink>.
            </p>
          ) : (
            <>
              <p className="text-xs text-soft">Pick the teams to show. With none picked, it shows them all.</p>
              {teams.map((t) => (
                <Toggle
                  key={t.id}
                  label={t.name}
                  checked={w.teamIds.includes(t.id)}
                  onChange={(on) => e((x) => void (x.teamIds = on ? [...x.teamIds, t.id] : x.teamIds.filter((id) => id !== t.id)))}
                />
              ))}
            </>
          )}
        </>
      );
    }
    case "photos": {
      const e = edit<"photos">();
      const sources = config.integrations.photos.sources;
      return (
        <>
          <PhotoInterval value={w.intervalSeconds} onChange={(v) => e((x) => void (x.intervalSeconds = v))} />
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
            <p className="text-xs text-soft">
              Add photo albums under <SettingsLink href="#settings/photos">Settings › Photos</SettingsLink>.
            </p>
          ) : (
            <>
              <p className="text-xs text-soft">Pick the albums to show. With none picked, it shows them all.</p>
              {sources.map((s) => (
                <Toggle
                  key={s.id}
                  label={s.name || "Album"}
                  checked={w.sourceIds.includes(s.id)}
                  onChange={(on) => e((x) => void (x.sourceIds = on ? [...x.sourceIds, s.id] : x.sourceIds.filter((id) => id !== s.id)))}
                />
              ))}
            </>
          )}
        </>
      );
    }
    case "haEntity": {
      const e = edit<"haEntity">();
      const provider = w.provider ?? "homeAssistant";
      return <HaEntitySettings widget={w} provider={provider} onEdit={e} />;
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
          <Stepper label="Notes shown" value={w.count} min={1} max={20} onChange={(v) => e((x) => void (x.count = v))} />
          <Toggle
            label="Post from the wall"
            hint="Anyone at the screen can leave a note. Keep this off if the display is easy to reach by guests."
            checked={w.allowAdd}
            onChange={(v) => e((x) => void (x.allowAdd = v))}
          />
          <p className="text-xs text-soft">
            The family posts notes from their phones at <span className="font-mono">/family/</span> (Messages tab here).
          </p>
        </>
      );
    }
    case "meals": {
      const e = edit<"meals">();
      return (
        <>
          <Select
            label="Days"
            value={String(w.days)}
            options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({
              value: String(n),
              label: n === 1 ? "Today (tomorrow from 8 PM)" : n === 7 ? "The week" : `The next ${n} days`,
            }))}
            onChange={(v) => e((x) => void (x.days = Number(v)))}
          />
          {MEAL_SLOTS.map((slot) => (
            <Toggle
              key={slot}
              label={`Show ${MEAL_LABELS[slot].toLowerCase()}`}
              checked={w.slots.includes(slot)}
              onChange={(on) =>
                e((x) => {
                  // Keep breakfast, lunch, dinner order, and at least one meal.
                  const next = MEAL_SLOTS.filter((s) => (s === slot ? on : x.slots.includes(s)));
                  if (next.length) x.slots = next;
                })
              }
            />
          ))}
          <p className="text-xs text-soft">
            Plan meals in the Meals tab here, or at <span className="font-mono">/family/</span> from a phone. Set a Repeat on a meal (every
            Monday, every 2 days, …) so future days fill in on their own.
          </p>
        </>
      );
    }
    case "menus": {
      const e = edit<"menus">();
      const defaultSchool = config.integrations.smartHome.menus.schoolName;
      return (
        <>
          <Text
            label="School slug"
            value={w.school || defaultSchool}
            maxLength={80}
            hint="From the district's Nutrislice URL. District slug lives under Settings › Menus."
            onChange={(v) => e((x) => void (x.school = v.trim()))}
          />
          <Stepper label="Days" value={w.days} min={1} max={7} onChange={(v) => e((x) => void (x.days = v))} />
          {(["breakfast", "lunch"] as const).map((slot) => (
            <Toggle
              key={slot}
              label={`Show ${MEAL_LABELS[slot].toLowerCase()}`}
              checked={w.slots.includes(slot)}
              onChange={(on) =>
                e((x) => {
                  const next = (["breakfast", "lunch"] as const).filter((s) => (s === slot ? on : x.slots.includes(s)));
                  if (next.length) x.slots = [...next];
                })
              }
            />
          ))}
        </>
      );
    }
    case "tempest": {
      const e = edit<"tempest">();
      return (
        <>
          <Toggle label="Wind" checked={w.showWind} onChange={(v) => e((x) => void (x.showWind = v))} />
          <Toggle label="Humidity" checked={w.showHumidity} onChange={(v) => e((x) => void (x.showHumidity = v))} />
          <Toggle label="Rain today" checked={w.showRain} onChange={(v) => e((x) => void (x.showRain = v))} />
          <p className="text-sm text-soft">
            Set station id and token under <SettingsLink href="#settings/weather-stations">Settings › Weather stations</SettingsLink>.
          </p>
        </>
      );
    }
    case "ecoflow":
      return <EcoFlowSettings w={w} e={edit<"ecoflow">()} />;
    case "unifi": {
      const e = edit<"unifi">();
      return (
        <>
          <UnifiSitePicker value={w.siteId} onChange={(v) => e((x) => void (x.siteId = v))} />
          <Stepper
            label="Slow from"
            value={w.slowMs}
            min={20}
            max={1000}
            step={10}
            format={(v) => `${v} ms`}
            hint="Latency at or above this shows the internet as slow."
            onChange={(v) => e((x) => void (x.slowMs = v))}
          />
          <Toggle label="Latency chart (24 h)" checked={w.showChart} onChange={(v) => e((x) => void (x.showChart = v))} />
          <Toggle label="Devices and clients" checked={w.showCounts} onChange={(v) => e((x) => void (x.showCounts = v))} />
          <Toggle
            label="Current usage"
            checked={w.showUsage}
            hint="What the home downloaded and uploaded in the last five minutes; not a speed test."
            onChange={(v) => e((x) => void (x.showUsage = v))}
          />
          <p className="text-sm text-soft">
            Save the Site Manager API key under <SettingsLink href="#settings/unifi">Settings › UniFi network</SettingsLink>.
          </p>
        </>
      );
    }
    case "weatherUnderground": {
      const e = edit<"weatherUnderground">();
      return (
        <>
          <Toggle label="Wind" checked={w.showWind} onChange={(v) => e((x) => void (x.showWind = v))} />
          <Toggle label="Humidity" checked={w.showHumidity} onChange={(v) => e((x) => void (x.showHumidity = v))} />
          <Toggle label="Rain" checked={w.showRain} onChange={(v) => e((x) => void (x.showRain = v))} />
          <p className="text-sm text-soft">
            Set station id under <SettingsLink href="#settings/weather-stations">Settings › Weather stations</SettingsLink>.
          </p>
        </>
      );
    }
    case "shopping": {
      const e = edit<"shopping">();
      return (
        <>
          <Stepper label="Items shown" value={w.count} min={1} max={40} onChange={(v) => e((x) => void (x.count = v))} />
          <Toggle label="Show bought items" checked={w.showDone} onChange={(v) => e((x) => void (x.showDone = v))} />
          <Toggle
            label="Tap to tick off"
            hint="Anyone at the screen can mark an item bought. Tapping it again puts it back."
            checked={w.allowCheck}
            onChange={(v) => e((x) => void (x.allowCheck = v))}
          />
          <Toggle
            label="Add from the wall"
            hint="Anyone at the screen can type a new item. Keep this off if guests can reach the display."
            checked={w.allowAdd}
            onChange={(v) => e((x) => void (x.allowAdd = v))}
          />
          <p className="text-xs text-soft">
            Family adds items from phones (<span className="font-mono">/family/</span>) or the Shopping tab here. Phone-edit QR skips
            sign-in.
          </p>
        </>
      );
    }
    case "tasks": {
      const e = edit<"tasks">();
      const lists =
        w.provider === "microsoft"
          ? config.integrations.microsoft.todoLists.filter((l) => l.enabled)
          : w.provider === "todoist"
            ? config.integrations.todoist.lists.filter((l) => l.enabled)
            : config.integrations.tasks.lists.filter((l) => l.enabled);
      return (
        <>
          <Select
            label="Provider"
            value={w.provider}
            options={[
              { value: "google", label: "Google Tasks" },
              { value: "microsoft", label: "Microsoft To Do" },
              { value: "todoist", label: "Todoist" },
            ]}
            onChange={(v) => e((x) => void ((x.provider = v), (x.listIds = [])))}
          />
          <Stepper label="Tasks shown" value={w.count} min={1} max={30} onChange={(v) => e((x) => void (x.count = v))} />
          <Toggle label="Show due dates" checked={w.showDue} onChange={(v) => e((x) => void (x.showDue = v))} />
          <Toggle
            label="Tap to tick off"
            hint="Anyone at the screen can mark a task done. A second tap within a few seconds undoes it."
            checked={w.allowCheck}
            onChange={(v) => e((x) => void (x.allowCheck = v))}
          />
          {lists.length === 0 ? (
            <p className="text-xs text-soft">
              Connect Google Tasks and switch on some lists under{" "}
              <SettingsLink href="#settings/tasks">Settings › Google Tasks</SettingsLink>.
            </p>
          ) : (
            <>
              <p className="text-xs text-soft">Pick the lists to show. With none picked, it shows them all.</p>
              {lists.map((l) => (
                <Toggle
                  key={l.id}
                  label={l.name}
                  checked={w.listIds.includes(l.id)}
                  onChange={(on) => e((x) => void (x.listIds = on ? [...x.listIds, l.id] : x.listIds.filter((id) => id !== l.id)))}
                />
              ))}
            </>
          )}
        </>
      );
    }
    case "chores": {
      const e = edit<"chores">();
      const people = config.chores.people;
      return (
        <>
          <Select
            label="Layout"
            value={w.layout}
            options={[
              { value: "columns", label: "Columns (list)" },
              { value: "byPeriod", label: "By time of day" },
              { value: "progress", label: "Progress rings" },
            ]}
            onChange={(v) => e((x) => void (x.layout = v))}
          />
          <Toggle label="Show stars" checked={w.showStars} onChange={(v) => e((x) => void (x.showStars = v))} />
          <Toggle
            label="Tap to tick off"
            hint="Anyone at the screen can mark a chore done. Tapping it again takes it back."
            checked={w.allowCheck}
            onChange={(v) => e((x) => void (x.allowCheck = v))}
          />
          {people.length === 0 ? (
            <p className="text-xs text-soft">
              Add the kids and their chores under <SettingsLink href="#settings/chores">Settings › Chores</SettingsLink>.
            </p>
          ) : (
            <>
              <p className="text-xs text-soft">Pick whose chores to show. With nobody picked, it shows everyone.</p>
              {people.map((p) => (
                <Toggle
                  key={p.id}
                  label={`${p.emoji} ${p.name}`.trim()}
                  checked={w.personIds.includes(p.id)}
                  onChange={(on) => e((x) => void (x.personIds = on ? [...x.personIds, p.id] : x.personIds.filter((id) => id !== p.id)))}
                />
              ))}
            </>
          )}
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
            list="ha-cameras"
            onChange={(v) => e((x) => void (x.entityId = v.trim()))}
          />
          <HaEntityList id="ha-cameras" only="camera." />
          <Range
            label="Refresh every"
            value={w.refreshSeconds}
            min={2}
            max={600}
            step={1}
            format={(n) => `${n} s`}
            onChange={(v) => e((x) => void (x.refreshSeconds = v))}
          />
        </>
      );
    }
    case "transit": {
      const e = edit<"transit">();
      return (
        <>
          <TransitStops
            stops={w.stops}
            onAdd={(s) => e((x) => void (x.stops = [...x.stops, s]))}
            onRemove={(id) => e((x) => void (x.stops = x.stops.filter((s) => s.id !== id)))}
          />
          <RoutesField routes={w.routes} onChange={(routes) => e((x) => void (x.routes = routes))} />
          <Stepper label="Departures per stop" value={w.count} min={1} max={12} onChange={(v) => e((x) => void (x.count = v))} />
          <Range
            label="Walk to the stop"
            value={w.walkMinutes}
            min={0}
            max={60}
            step={1}
            format={(n) => `${n} min`}
            hint="Buses leaving sooner than this are left out, since nobody could catch them."
            onChange={(v) => e((x) => void (x.walkMinutes = v))}
          />
        </>
      );
    }
    case "media": {
      const e = edit<"media">();
      return (
        <>
          <Select
            label="Player from"
            value={w.provider}
            options={[
              { value: "homeAssistant", label: "Home Assistant" },
              { value: "spotify", label: "Spotify (signed in directly)" },
              { value: "sonos", label: "Sonos (signed in directly)" },
            ]}
            hint={
              <>
                Connect Spotify or Sonos under <SettingsLink href="#settings/music">Settings › Music</SettingsLink> to use them without Home
                Assistant.
              </>
            }
            onChange={(v) => e((x) => void (x.provider = v))}
          />
          {w.provider === "homeAssistant" && (
            <>
              <Text
                label="Player"
                value={w.entityId}
                maxLength={255}
                placeholder="media_player.kitchen"
                list="ha-players"
                onChange={(v) => e((x) => void (x.entityId = v.trim()))}
              />
              <HaEntityList id="ha-players" only="media_player." />
              <p className="text-xs text-soft">
                A Sonos speaker or Spotify (media_player.spotify_…) from Home Assistant&rsquo;s Sonos or Spotify integration.
              </p>
            </>
          )}
          {w.provider === "spotify" && (
            <p className="text-xs text-soft">Follows whatever the connected Spotify account is playing, on any speaker.</p>
          )}
          {w.provider === "sonos" && <SonosSpeaker value={w.playerId} onChange={(v) => e((x) => void (x.playerId = v))} />}
          <Toggle label="Album art" checked={w.showArt} onChange={(v) => e((x) => void (x.showArt = v))} />
          <Toggle label="Volume" checked={w.showVolume} onChange={(v) => e((x) => void (x.showVolume = v))} />
          <Toggle
            label="Sources to play"
            checked={w.showSources}
            hint="Sonos favourites, or for Spotify the speakers to play on."
            onChange={(v) => e((x) => void (x.showSources = v))}
          />
        </>
      );
    }
    case "timer": {
      const e = edit<"timer">();
      return (
        <>
          <TimerPresets presets={w.presets} onChange={e} />
          <AlertSettings w={w} onChange={e} />
        </>
      );
    }
    case "pomodoro": {
      const e = edit<"pomodoro">();
      return (
        <>
          <Range
            label="Focus"
            value={w.workMinutes}
            min={1}
            max={120}
            step={1}
            format={(n) => `${n} min`}
            onChange={(v) => e((x) => void (x.workMinutes = v))}
          />
          <Range
            label="Break"
            value={w.shortBreakMinutes}
            min={1}
            max={60}
            step={1}
            format={(n) => `${n} min`}
            onChange={(v) => e((x) => void (x.shortBreakMinutes = v))}
          />
          <Range
            label="Long break"
            value={w.longBreakMinutes}
            min={1}
            max={90}
            step={1}
            format={(n) => `${n} min`}
            onChange={(v) => e((x) => void (x.longBreakMinutes = v))}
          />
          <Stepper
            label="Focus rounds before the long break"
            value={w.rounds}
            min={1}
            max={12}
            onChange={(v) => e((x) => void (x.rounds = v))}
          />
          <Toggle
            label="Start the next phase by itself"
            checked={w.autoStart}
            hint="Off: it waits for a tap on Start after each focus round and break."
            onChange={(v) => e((x) => void (x.autoStart = v))}
          />
          <AlertSettings w={w} onChange={e} />
        </>
      );
    }
    case "presence": {
      const e = edit<"presence">();
      const blank = w.entities.some((person) => !person.entityId);
      return (
        <>
          <p className="text-xs text-soft">
            People or phones from Home Assistant. The wall shows who is home, and can&rsquo;t change anything.
          </p>
          {w.entities.map((person, i) => (
            <div key={`${person.entityId}-${i}`} className="grid gap-2 rounded-xl border border-line p-3">
              <Text
                label="Entity"
                value={person.entityId}
                maxLength={255}
                placeholder="person.melvin"
                list="ha-presence"
                onChange={(v) => e((x) => void (x.entities[i]!.entityId = v.trim()))}
              />
              <Text
                label="Name"
                value={person.label}
                maxLength={40}
                placeholder="From Home Assistant"
                onChange={(v) => e((x) => void (x.entities[i]!.label = v))}
              />
              <button
                type="button"
                className="btn-ghost justify-self-start text-bad"
                onClick={() => e((x) => void x.entities.splice(i, 1))}
              >
                Remove
              </button>
            </div>
          ))}
          <HaEntityList id="ha-presence" />
          {w.entities.length < 12 && (
            <button
              type="button"
              className="btn-ghost justify-self-start"
              disabled={blank}
              onClick={() => e((x) => void x.entities.push({ entityId: "", label: "" }))}
            >
              Add a person
            </button>
          )}
        </>
      );
    }
    case "school": {
      const e = edit<"school">();
      return (
        <>
          <SchoolNames schools={w.schools} onChange={(schools) => e((x) => void (x.schools = schools))} />
          <p className="text-xs text-soft">
            The district page is set under <SettingsLink href="#settings/school">Settings › School status</SettingsLink>.
          </p>
        </>
      );
    }
    case "packages": {
      const e = edit<"packages">();
      return (
        <>
          <Stepper label="Packages shown" value={w.count} min={1} max={12} onChange={(v) => e((x) => void (x.count = v))} />
          <Toggle label="Show delivered" checked={w.showDelivered} onChange={(v) => e((x) => void (x.showDelivered = v))} />
          {w.packages.map((p, i) => (
            <div key={p.id} className="grid gap-2 rounded-xl border border-line p-3">
              <Select
                label="Carrier"
                value={p.carrier}
                options={[
                  { value: "ups", label: "UPS" },
                  { value: "fedex", label: "FedEx" },
                  { value: "canadaPost", label: "Canada Post" },
                  { value: "usps", label: "USPS" },
                  { value: "other", label: "Other" },
                ]}
                onChange={(v) => e((x) => void (x.packages[i]!.carrier = v))}
              />
              <Text
                label="Tracking number"
                value={p.trackingNumber}
                maxLength={64}
                onChange={(v) => e((x) => void (x.packages[i]!.trackingNumber = v))}
              />
              <Text
                label="Label"
                value={p.label ?? ""}
                maxLength={40}
                placeholder="Optional"
                onChange={(v) => e((x) => void (x.packages[i]!.label = v || undefined))}
              />
              <button
                type="button"
                className="btn-ghost justify-self-start text-bad"
                onClick={() => e((x) => void x.packages.splice(i, 1))}
              >
                Remove
              </button>
            </div>
          ))}
          {w.packages.length < 12 && (
            <button
              type="button"
              className="btn-ghost justify-self-start"
              onClick={() => e((x) => void x.packages.push({ id: newId("pkg"), carrier: "ups", trackingNumber: "", label: "" }))}
            >
              Add a package
            </button>
          )}
          <p className="text-xs text-soft">
            Set <span className="font-mono">PACKAGE_TRACK_API_KEY</span> on the server for live status (optional).
          </p>
        </>
      );
    }
    case "tides": {
      const e = edit<"tides">();
      return (
        <>
          <Text label="Station name" value={w.stationName} maxLength={80} onChange={(v) => e((x) => void (x.stationName = v))} />
          <Text
            label="Station id"
            value={w.stationId}
            maxLength={40}
            hint="NOAA: digits only. Canada: iwls:8320 for Point Atkinson."
            onChange={(v) => e((x) => void (x.stationId = v))}
          />
          <Stepper label="Highs and lows shown" value={w.count} min={1} max={8} onChange={(v) => e((x) => void (x.count = v))} />
          <Toggle label="Show height" checked={w.showHeight} onChange={(v) => e((x) => void (x.showHeight = v))} />
          <p className="text-xs text-soft">
            See{" "}
            <a className="text-brand underline-offset-2 hover:underline" href="/docs/tides.md">
              docs/tides.md
            </a>{" "}
            for stations.
          </p>
        </>
      );
    }
    case "stocks": {
      const e = edit<"stocks">();
      return (
        <>
          <Text
            label="Symbols (comma-separated)"
            value={w.symbols.join(", ")}
            maxLength={120}
            onChange={(v) =>
              e(
                (x) =>
                  void (x.symbols = v
                    .split(/[,\s]+/)
                    .filter(Boolean)
                    .slice(0, 12)),
              )
            }
          />
          <Stepper label="Rows" value={w.count} min={1} max={12} onChange={(v) => e((x) => void (x.count = v))} />
          <Toggle label="Show daily change %" checked={w.showChange} onChange={(v) => e((x) => void (x.showChange = v))} />
        </>
      );
    }
    case "crypto": {
      const e = edit<"crypto">();
      return (
        <>
          <Text
            label="CoinGecko ids"
            value={w.coins.join(", ")}
            maxLength={200}
            onChange={(v) =>
              e(
                (x) =>
                  void (x.coins = v
                    .split(/[,\s]+/)
                    .filter(Boolean)
                    .slice(0, 12)),
              )
            }
          />
          <Text label="Quote currency" value={w.vs} maxLength={3} onChange={(v) => e((x) => void (x.vs = v.toLowerCase().slice(0, 3)))} />
        </>
      );
    }
    case "tradingView": {
      const e = edit<"tradingView">();
      return <Text label="Symbol" value={w.symbol} maxLength={32} onChange={(v) => e((x) => void (x.symbol = v))} />;
    }
    case "maps": {
      const e = edit<"maps">();
      return (
        <>
          <Text label="Place or query" value={w.query} maxLength={200} onChange={(v) => e((x) => void (x.query = v))} />
          <Stepper label="Zoom" value={w.zoom} min={1} max={20} onChange={(v) => e((x) => void (x.zoom = v))} />
        </>
      );
    }
    case "youtube":
    case "vimeo": {
      const e = edit<"youtube" | "vimeo">();
      return <Text label="Video or playlist id" value={w.videoId} maxLength={64} onChange={(v) => e((x) => void (x.videoId = v))} />;
    }
    case "instagram": {
      const e = edit<"instagram">();
      return (
        <>
          <Text label="Post URL" value={w.embedUrl} maxLength={500} type="url" onChange={(v) => e((x) => void (x.embedUrl = v))} />
          <p className="text-xs text-soft">Public post or reel links only. Profile grids need Meta app review.</p>
        </>
      );
    }
    case "affirmation": {
      const e = edit<"affirmation">();
      return (
        <>
          <Select
            label="Category"
            value={w.category}
            options={[
              { value: "general", label: "General" },
              { value: "kids", label: "Kids" },
              { value: "calm", label: "Calm" },
              { value: "courage", label: "Courage" },
            ]}
            onChange={(v) => e((x) => void (x.category = v))}
          />
          <TextArea
            label="Extra lines (one per row)"
            value={w.custom.join("\n")}
            maxLength={2000}
            onChange={(v) =>
              e((x) => {
                x.custom = v
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .slice(0, 24);
              })
            }
          />
          <p className="text-xs text-soft">Mixed with the built-in bank. The wall picks one for the local day.</p>
        </>
      );
    }
    case "horoscope": {
      const e = edit<"horoscope">();
      return (
        <>
          <Select
            label="Sign"
            value={w.sign}
            options={[
              { value: "aries", label: "Aries" },
              { value: "taurus", label: "Taurus" },
              { value: "gemini", label: "Gemini" },
              { value: "cancer", label: "Cancer" },
              { value: "leo", label: "Leo" },
              { value: "virgo", label: "Virgo" },
              { value: "libra", label: "Libra" },
              { value: "scorpio", label: "Scorpio" },
              { value: "sagittarius", label: "Sagittarius" },
              { value: "capricorn", label: "Capricorn" },
              { value: "aquarius", label: "Aquarius" },
              { value: "pisces", label: "Pisces" },
            ]}
            onChange={(v) => e((x) => void (x.sign = v))}
          />
          <p className="text-xs text-soft">Playful kitchen blurbs — not a live astrology feed.</p>
        </>
      );
    }
    case "rss":
    case "news":
    case "dadJoke":
    case "quotes":
    case "fx":
    case "ynab":
    case "fitbit":
    case "emailCount":
    case "trello":
    case "slack":
    case "airports":
      return (
        <p className="text-xs text-soft">
          More options are in Settings › Content &amp; finance. Save the dashboard when you change integrations.
        </p>
      );
    case "whiteboard":
      return (
        <p className="text-xs text-soft">
          Finger draw on the wall with a few colours and an eraser. Every display shows the same doodle. A wider tile shows more colours.
          Hold Clear to wipe the board.
        </p>
      );
    case "internet": {
      const e = edit<"internet">();
      return (
        <>
          <p className="text-xs text-soft">
            Measured by the screen&rsquo;s own browser against Cloudflare&rsquo;s speed test servers, so it shows the internet where the
            screen is. Each screen with this widget measures for itself.
          </p>
          <Select
            label="Check the ping every"
            value={String(w.pingSeconds)}
            options={[
              { value: "10", label: "10 seconds" },
              { value: "30", label: "30 seconds" },
              { value: "60", label: "Minute" },
              { value: "300", label: "5 minutes" },
            ]}
            onChange={(v) => e((x) => void (x.pingSeconds = Number(v)))}
          />
          <Stepper
            label="Slow above"
            value={w.slowMs}
            min={20}
            max={2000}
            step={10}
            format={(n) => `${n} ms`}
            hint="A ping above this shows as Slow. A good home line is under 30 ms to Cloudflare."
            onChange={(v) => e((x) => void (x.slowMs = v))}
          />
          <Select
            label="Speed test"
            value={String(w.speedHours)}
            options={[
              { value: "0", label: "Only when someone taps the widget" },
              { value: "1", label: "Every hour" },
              { value: "3", label: "Every 3 hours" },
              { value: "6", label: "Every 6 hours" },
              { value: "12", label: "Every 12 hours" },
              { value: "24", label: "Once a day" },
            ]}
            hint="A test downloads about 11 MB on a slow line and up to about 60 MB on a fast one. A tap on the widget runs one now."
            onChange={(v) => e((x) => void (x.speedHours = Number(v)))}
          />
          <Toggle
            label="Upload speed too"
            checked={w.upload}
            hint="Sends up to about 12 MB more."
            onChange={(v) => e((x) => void (x.upload = v))}
          />
          <Toggle label="Ping graph" checked={w.showGraph} onChange={(v) => e((x) => void (x.showGraph = v))} />
        </>
      );
    }
    default:
      return null;
  }
}

/** School name fragments matched in the district notice. Kept as typed until it parses, so a trailing comma isn't eaten. */
function SchoolNames({ schools, onChange }: { schools: string[]; onChange: (schools: string[]) => void }) {
  const [text, setText] = useState(schools.join(", "));
  return (
    <Text
      label="Only these schools"
      value={text}
      maxLength={1000}
      placeholder="Any district notice"
      hint="Names separated by commas, matched in the notice. Empty shows any closure or delay."
      onChange={(v) => {
        setText(v);
        onChange(
          [
            ...new Set(
              v
                .split(",")
                .map((name) => name.trim())
                .filter(Boolean),
            ),
          ]
            .slice(0, 12)
            .map((name) => name.slice(0, 80)),
        );
      }}
    />
  );
}

type Alerting = Extract<Widget, { type: "timer" | "pomodoro" }>;

/** How a timer or the pomodoro says it's done. The widget itself always flashes. */
function AlertSettings<T extends Alerting>({ w, onChange }: { w: T; onChange: (change: (x: T) => void) => void }) {
  return (
    <>
      <Toggle label="Sound" checked={w.sound} onChange={(v) => onChange((x) => void (x.sound = v))} />
      <Toggle
        label="Full-screen alert"
        checked={w.fullScreen}
        hint="Flashes the whole screen with what's done, until someone taps."
        onChange={(v) => onChange((x) => void (x.fullScreen = v))}
      />
      <Range
        label="Stop alerting after"
        value={w.ringSeconds}
        min={5}
        max={600}
        step={5}
        format={(n) => `${n} s`}
        onChange={(v) => onChange((x) => void (x.ringSeconds = v))}
      />
    </>
  );
}

const QUICK_TIMERS = [
  { label: "1 min", seconds: 60 },
  { label: "3 min", seconds: 180 },
  { label: "5 min", seconds: 300 },
  { label: "10 min", seconds: 600 },
] as const;

function TimerPresets({ presets, onChange }: { presets: TimerPreset[]; onChange: Edit<"timer"> }) {
  const setLength = (i: number, minutes: number, seconds: number) =>
    onChange((x) => void (x.presets[i]!.seconds = Math.min(86_400, Math.max(5, minutes * 60 + seconds))));
  return (
    <div className="grid gap-3">
      <p className="text-xs text-soft">The buttons on the wall. A tap starts a timer; up to six run at once.</p>
      {presets.length < 12 && (
        <div className="flex flex-wrap gap-2">
          {QUICK_TIMERS.map((q) => (
            <button
              key={q.seconds}
              type="button"
              className="btn-ghost min-h-11"
              onClick={() =>
                onChange((x) => {
                  if (x.presets.length >= 12) return;
                  x.presets.push({ id: newId("tm"), label: "", emoji: "", seconds: q.seconds });
                })
              }
            >
              + {q.label}
            </button>
          ))}
        </div>
      )}
      {presets.map((p, i) => (
        <div key={p.id} className="grid gap-2 rounded-xl border border-line p-3">
          <div className="grid grid-cols-[4rem_1fr] gap-2">
            <Text label="Emoji" value={p.emoji} maxLength={8} onChange={(v) => onChange((x) => void (x.presets[i]!.emoji = v))} />
            <Text
              label="Name"
              value={p.label}
              maxLength={30}
              placeholder="Just the time"
              onChange={(v) => onChange((x) => void (x.presets[i]!.label = v))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stepper
              label="Minutes"
              value={Math.floor(p.seconds / 60)}
              min={0}
              max={1440}
              onChange={(v) => setLength(i, v, p.seconds % 60)}
            />
            <Stepper
              label="Seconds"
              value={p.seconds % 60}
              min={0}
              max={59}
              onChange={(v) => setLength(i, Math.floor(p.seconds / 60), v)}
            />
          </div>
          <button
            type="button"
            className="btn-ghost justify-self-start text-bad"
            onClick={() => onChange((x) => void x.presets.splice(i, 1))}
          >
            Remove
          </button>
        </div>
      ))}
      {presets.length < 12 && (
        <button
          type="button"
          className="btn-ghost justify-self-start"
          onClick={() => onChange((x) => void x.presets.push({ id: newId("tm"), label: "", emoji: "", seconds: 300 }))}
        >
          Add a timer button
        </button>
      )}
    </div>
  );
}

function PhotoInterval({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const known = PHOTO_INTERVALS.some((o) => o.value !== "custom" && Number(o.value) === value);
  const [forceCustom, setForceCustom] = useState(!known);
  const segment = forceCustom || !known ? "custom" : (String(value) as (typeof PHOTO_INTERVALS)[number]["value"]);
  return (
    <div className="grid gap-3">
      <Segmented
        label="Seconds per photo"
        value={segment}
        options={PHOTO_INTERVALS}
        onChange={(v) => {
          if (v === "custom") setForceCustom(true);
          else {
            setForceCustom(false);
            onChange(Number(v));
          }
        }}
      />
      {(forceCustom || !known) && (
        <Range label="Custom interval" value={value} min={5} max={3600} step={5} format={(n) => `${n} s`} onChange={onChange} />
      )}
    </div>
  );
}

function SonosSpeaker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const status = useMusic();
  const players = status?.sonos.players ?? [];
  if (!status) return <p className="text-xs text-soft">Loading the Sonos speakers…</p>;
  if (!status.sonos.connected)
    return (
      <p className="text-xs text-soft">
        Connect Sonos under <SettingsLink href="#settings/music">Settings › Music</SettingsLink> first.
      </p>
    );
  // A saved speaker Sonos no longer lists stays selectable, so it can be seen and changed.
  const options = [
    { value: "", label: "Pick a speaker" },
    ...players.map((p) => ({ value: p.id, label: p.name })),
    ...(value && !players.some((p) => p.id === value) ? [{ value, label: `${value} (not found)` }] : []),
  ];
  return (
    <Select
      label="Speaker"
      value={value}
      options={options}
      hint="Plays, pauses and sets the volume for whatever group this speaker is in."
      onChange={onChange}
    />
  );
}

function CountdownEvents({ events, count, onChange }: { events: CountdownEvent[]; count: number; onChange: Edit<"countdown"> }) {
  return (
    <>
      <Stepper label="Events shown" value={count} min={1} max={12} onChange={(v) => onChange((x) => void (x.count = v))} />
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

interface StopMatch {
  id: string;
  code: string;
  name: string;
  km: number;
}
type TransitStop = { id: string; code: string; name: string };

/** Finds TransLink stops by the number on the stop's sign or by name; with nothing typed, the ones nearest home. */
function TransitStops({
  stops,
  onAdd,
  onRemove,
}: {
  stops: TransitStop[];
  onAdd: (s: TransitStop) => void;
  onRemove: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<StopMatch[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setNote("");
    const r = await fetch(`/api/household/transit/?${new URLSearchParams({ q: q.trim() })}`).catch(() => null);
    const body = (await r?.json().catch(() => ({}))) as { stops?: StopMatch[]; keySet?: boolean; error?: string } | undefined;
    setBusy(false);
    setMatches(body?.stops ?? []);
    if (!r?.ok) setNote(body?.error ?? "Couldn't search TransLink's stops.");
    else if (body?.keySet === false) setNote("Departures show once TRANSLINK_API_KEY is set in Vercel (docs/translink.md).");
  }

  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">Stops</p>
      {stops.length === 0 && <p className="text-xs text-soft">No stops yet. Find one below.</p>}
      {stops.map((s) => (
        <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
          <span className="min-w-0 truncate">
            {s.name} {s.code && <span className="text-soft">#{s.code}</span>}
          </span>
          <button type="button" className="btn-ghost" onClick={() => onRemove(s.id)}>
            Remove
          </button>
        </div>
      ))}
      {stops.length < 6 && (
        <form className="flex items-end gap-2" onSubmit={(e) => void search(e)}>
          <div className="min-w-0 flex-1">
            <Text label="Find a stop" value={q} maxLength={60} placeholder="Stop number or name; empty for the nearest" onChange={setQ} />
          </div>
          <button className="btn-primary" disabled={busy}>
            {busy ? "Finding…" : "Find"}
          </button>
        </form>
      )}
      {note && <p className="text-xs text-soft">{note}</p>}
      {matches && stops.length < 6 && (
        <div className="grid gap-1">
          {matches.length === 0 && !note && <p className="text-xs text-soft">No stops matched.</p>}
          {matches
            .filter((m) => !stops.some((s) => s.id === m.id))
            .map((m) => (
              <button
                key={m.id}
                type="button"
                className="btn-ghost justify-start text-left"
                onClick={() => onAdd({ id: m.id, code: m.code, name: m.name })}
              >
                {m.name} {m.code && <span className="text-soft">#{m.code}</span>} <span className="text-soft">· {m.km} km</span>
              </button>
            ))}
        </div>
      )}
      <p className="text-xs text-soft">
        Route and arrival data used in this product or service is provided by permission of TransLink. TransLink assumes no responsibility
        for the accuracy or currency of the Data used in this product or service.
      </p>
    </div>
  );
}

/** Route numbers to show, typed as "502, 503"; kept as typed until it parses, so a trailing comma isn't eaten. */
function RoutesField({ routes, onChange }: { routes: string[]; onChange: (routes: string[]) => void }) {
  const [text, setText] = useState(routes.join(", "));
  return (
    <Text
      label="Only these routes"
      value={text}
      maxLength={200}
      placeholder="All routes"
      hint="Route numbers separated by commas, like 502, 503. Empty shows every route."
      onChange={(v) => {
        setText(v);
        onChange(
          [
            ...new Set(
              v
                .split(/[\s,]+/)
                .map((r) => r.trim().toUpperCase())
                .filter(Boolean),
            ),
          ]
            .slice(0, 30)
            .map((r) => r.slice(0, 12)),
        );
      }}
    />
  );
}

function EcoFlowSettings({
  w,
  e,
}: {
  w: Extract<Widget, { type: "ecoflow" }>;
  e: (fn: (x: Extract<Widget, { type: "ecoflow" }>) => void) => void;
}) {
  const status = useEcoFlow();
  const devices = status?.devices ?? [];
  // A serial saved earlier that the account no longer lists still shows, so it can be switched off.
  const extra = w.devices.filter((sn) => !devices.some((d) => d.sn === sn));
  return (
    <>
      <Toggle label="Solar input" checked={w.showSolar} onChange={(v) => e((x) => void (x.showSolar = v))} />
      <Toggle label="AC and DC in and out" checked={w.showFlows} onChange={(v) => e((x) => void (x.showFlows = v))} />
      <Toggle label="Time to full or empty" checked={w.showTime} onChange={(v) => e((x) => void (x.showTime = v))} />
      {!status ? (
        <p className="text-sm text-soft">Checking EcoFlow…</p>
      ) : !status.connected ? (
        <p className="text-sm text-soft">
          Add your EcoFlow keys under <SettingsLink href="#settings/ecoflow">Settings › EcoFlow</SettingsLink>.
        </p>
      ) : (
        <>
          <p className="text-xs text-soft">Pick the devices to show (up to eight). None picked shows them all.</p>
          {[...devices.map((d) => ({ sn: d.sn, name: d.name })), ...extra.map((sn) => ({ sn, name: `${sn} (not on the account)` }))].map(
            (d) => (
              <Toggle
                key={d.sn}
                label={d.name}
                checked={w.devices.includes(d.sn)}
                onChange={(on) =>
                  e((x) => {
                    const next = on ? [...x.devices, d.sn] : x.devices.filter((sn) => sn !== d.sn);
                    if (next.length <= 8) x.devices = next;
                  })
                }
              />
            ),
          )}
          {status.error && <p className="text-sm text-bad">{status.error}</p>}
        </>
      )}
    </>
  );
}
