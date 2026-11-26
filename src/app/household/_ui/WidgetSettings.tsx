"use client";

import { useEffect, useState, type ReactNode } from "react";

import { AIRTHINGS_KINDS, AIRTHINGS_LABELS } from "@/lib/airthings";
import { POOL_KINDS, POOL_LABELS } from "@/lib/blueRiiot";
import { BORDER_CROSSINGS, BORDER_DIRECTION_LABELS, BORDER_DIRECTIONS, BORDER_INFO } from "@/lib/border";
import { BRIEF_SOURCE_LABELS, BRIEF_SOURCES } from "@/lib/briefSources";
import { PERIOD_LABELS, PERIODS } from "@/lib/config/periods";
import type { CountdownEvent, DashboardConfig, TimerPreset, Widget } from "@/lib/config/schema";
import { WIDGETS } from "@/lib/config/widgets";
import { DRIVEBC_LICENCE, DRIVEBC_MAX_CAMERAS, DRIVEBC_REFRESH } from "@/lib/drivebc";
import { EARTH_OVERLAY_LABELS, EARTH_OVERLAYS, EARTH_ZOOM_LABELS, EARTH_ZOOMS } from "@/lib/earth";
import { FERRY_ROUTES, ferryRouteName } from "@/lib/ferries";
import { GAS_FUEL_LABELS, GAS_FUELS, GAS_RADIUS_MAX, GAS_RADIUS_MIN, GAS_SORT_LABELS, GAS_SORTS } from "@/lib/gas";
import { MEAL_LABELS, MEAL_SLOTS } from "@/lib/meals";
import { regionOf } from "@/lib/regions";
import { RIVER_PRESETS, RIVER_STATION_RE } from "@/lib/rivers";
import { LIGHT_PROVIDERS, type DirectSmartProvider } from "@/lib/smartHome";
import { MOUNTAINS } from "@/lib/snow";
import { agencyOf, TRANSIT_AGENCIES, TRANSIT_AGENCY_IDS, type TransitAgencyId } from "@/lib/transitAgencies";
import { WINDY_OVERLAY_LABELS, WINDY_OVERLAYS, windyPressureAllowed } from "@/lib/windy";

import { useAirthings } from "./airthings";
import { usePools } from "./blueRiiot";
import { PlaceFinder } from "./CommutePanel";
import { useEcoFlow } from "./EcoFlowPanel";
import { Range, Segmented, Select, Stepper, Text, TextArea, Toggle } from "./fields";
import { HaEntityList, useHa } from "./haEntities";
import { useLaundry } from "./laundry";
import { shrink } from "./LibraryAlbum";
import { useMusic } from "./music";
import { usePackages } from "./packages";
import { useRachio } from "./rachio";
import { loadSmartProvider, type SmartProviderDetail } from "./smartHome";
import { newId } from "./store";
import { UnifiSitePicker } from "./UnifiPanel";

const PROVIDER_NAMES: Partial<Record<string, string>> = { govee: "Govee", hue: "Philips Hue", lifx: "LIFX" };

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
  { value: "10", label: "10 S" },
  { value: "30", label: "30 S" },
  { value: "60", label: "1 Min" },
  { value: "300", label: "5 Min" },
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
  { value: "month", label: "The Whole Month" },
  ...(["1", "2", "3", "4", "5", "6"] as const).map((n) => ({ value: n, label: n === "1" ? "This Week" : `${n} weeks from this one` })),
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
        <summary className="cursor-pointer text-xs font-semibold tracking-wide text-soft uppercase">Looks &Amp; Schedule</summary>
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
      <legend className="mb-1 text-sm font-medium">Show During</legend>
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
          label="Background Opacity"
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
        label="Outer Padding"
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
      label="Font Size"
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
  // Direct providers list their own devices, so a Govee light (or a Nest thermostat) is picked by name, not typed.
  const [direct, setDirect] = useState<{ provider: string; detail: SmartProviderDetail } | null>(null);
  useEffect(() => {
    if (provider === "homeAssistant") return;
    let live = true;
    void loadSmartProvider(provider).then((detail) => live && setDirect({ provider, detail }));
    return () => {
      live = false;
    };
  }, [provider]);
  const devices = direct?.provider === provider ? direct.detail.devices : [];

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
          { value: "govee", label: "Govee Lights" },
          { value: "hue", label: "Philips Hue Lights" },
          { value: "lifx", label: "LIFX Lights" },
        ]}
        onChange={(v) => e((x) => void ((x.provider = v), LIGHT_PROVIDERS.includes(v as DirectSmartProvider) && (x.control = "light")))}
      />
      {provider !== "homeAssistant" && devices.length > 0 ? (
        <Select
          label="Device"
          value={devices.some((d) => d.id === w.entityId) ? w.entityId : ""}
          options={[
            { value: "", label: "Choose a Device…" },
            ...devices.map((d) => ({ value: d.id, label: d.sku ? `${d.name} (${d.sku})` : d.name })),
          ]}
          onChange={(v) => e((x) => void (x.entityId = v))}
        />
      ) : null}
      {provider === "homeAssistant" && entities.length > 0 ? (
        <Select
          label="Device"
          value={picked ? w.entityId : ""}
          options={[
            { value: "", label: "Choose a Device…" },
            ...entities.map((ent) => ({ value: ent.id, label: ent.name && ent.name !== ent.id ? `${ent.name} (${ent.id})` : ent.id })),
          ]}
          onChange={(v) => e((x) => void (x.entityId = v))}
          hint="Names from your Home Assistant. Pick one instead of typing an entity id."
        />
      ) : null}
      <Text
        label={(provider === "homeAssistant" ? entities.length : devices.length) > 0 ? "Or Paste Entity ID" : "Entity"}
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
          {devices.length > 0 ? "Devices from your account. " : null}
          Connect {PROVIDER_NAMES[provider] ?? provider} under{" "}
          <SettingsLink href="#settings/smart-home">Settings › Smart Home</SettingsLink>
          {devices.length > 0 ? " to change the account." : ", then pick a device here."}
          {provider === "govee" ? " Colour and scenes show while the light is on." : null}
          {provider === "hue" || provider === "lifx" ? " Colour shows for colour lights while they are on." : null}
        </p>
      )}
      <details className="grid gap-3 rounded-xl border border-line bg-bg px-3 py-2" open={w.control !== "auto"}>
        <summary className="cursor-pointer text-sm font-semibold text-ink">Advanced Control Type</summary>
        <Select
          label="Control"
          value={w.control}
          options={[
            { value: "auto", label: "Pick from the Entity" },
            { value: "toggle", label: "On/off Switch" },
            { value: "light", label: "Light with Brightness" },
            { value: "sensor", label: "Reading" },
            { value: "climate", label: "Thermostat" },
            { value: "cover", label: "Blinds or Garage Door" },
            { value: "lock", label: "Lock" },
            { value: "button", label: "Button or Scene" },
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
          <Toggle label="Show Seconds" checked={w.showSeconds} onChange={(v) => e((x) => void (x.showSeconds = v))} />
        </>
      );
    }
    case "date": {
      const e = edit<"date">();
      return (
        <>
          <Select
            label="Time Zone"
            value={w.timeZone}
            options={zoneOptions(w.timeZone)}
            onChange={(v) => e((x) => void (x.timeZone = v))}
          />
          <Toggle label="Show the Year" checked={w.showYear} onChange={(v) => e((x) => void (x.showYear = v))} />
        </>
      );
    }
    case "sunTimes": {
      const e = edit<"sunTimes">();
      return (
        <>
          <Toggle
            label="Show Emoji"
            checked={w.showEmoji}
            hint="The sunrise and sunset icons, and the sun on the daylight line."
            onChange={(v) => e((x) => void (x.showEmoji = v))}
          />
          <Toggle
            label="Show Hours of Daylight"
            checked={w.showDaylight}
            hint="The line under the times, like “8 hr 51 min of daylight”."
            onChange={(v) => e((x) => void (x.showDaylight = v))}
          />
          <Toggle
            label="Show the Moon"
            checked={w.showMoon}
            hint="Tonight's phase and how much of it is lit, like “Waxing gibbous · 82% lit”."
            onChange={(v) => e((x) => void (x.showMoon = v))}
          />
          <p className="text-xs text-soft">Times are for {config.location.name || "the dashboard's location"} (Settings).</p>
        </>
      );
    }
    case "weather": {
      const e = edit<"weather">();
      return (
        <>
          <Toggle label="Show Current Conditions" checked={w.showCurrent} onChange={(v) => e((x) => void (x.showCurrent = v))} />
          <Toggle label="Show the Next Hours" checked={w.showHourly} onChange={(v) => e((x) => void (x.showHourly = v))} />
          <Range
            label="Forecast Icon Size"
            value={w.iconScale ?? 1}
            min={0.5}
            max={1.5}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            hint="Scales the hourly and future-day weather icons. Today's icon stays large."
            onChange={(v) =>
              e((x) => {
                if (v === 1) delete x.iconScale;
                else x.iconScale = v;
              })
            }
          />
          <Toggle label="Show the UV Index" checked={w.showUv} onChange={(v) => e((x) => void (x.showUv = v))} />
          <Toggle
            label="Show Pollen"
            checked={w.showPollen}
            hint="The highest count Open-Meteo reports. Often missing in North America."
            onChange={(v) => e((x) => void (x.showPollen = v))}
          />
          <Stepper label="Days Ahead" value={w.days} min={0} max={7} onChange={(v) => e((x) => void (x.days = v))} />
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
          <Text label="Network Name" value={w.ssid} maxLength={32} onChange={(v) => e((x) => void (x.ssid = v))} />
          <Select
            label="Security"
            value={w.encryption}
            options={[
              { value: "WPA", label: "WPA / WPA2 / WPA3" },
              { value: "WEP", label: "WEP" },
              { value: "nopass", label: "None (Open Network)" },
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
          <Toggle label="Hidden Network" checked={w.hidden} onChange={(v) => e((x) => void (x.hidden = v))} />
          <Toggle label="Show the Password as Text Too" checked={w.showPassword} onChange={(v) => e((x) => void (x.showPassword = v))} />
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
      return <CountdownEvents w={w} onChange={e} />;
    }
    case "calendarWeek": {
      const e = edit<"calendarWeek">();
      return (
        <>
          <Select
            label="Week Starts On"
            value={String(w.weekStartsOn)}
            options={[
              { value: "0", label: "Sunday" },
              { value: "1", label: "Monday" },
            ]}
            onChange={(v) => e((x) => void (x.weekStartsOn = Number(v) as 0 | 1))}
          />
          <Toggle label="Show Weekends" checked={w.showWeekends} onChange={(v) => e((x) => void (x.showWeekends = v))} />
        </>
      );
    }
    case "calendarUpNext": {
      const e = edit<"calendarUpNext">();
      return <Stepper label="Also Show Next" value={w.count} min={1} max={10} onChange={(v) => e((x) => void (x.count = v))} />;
    }
    case "agenda": {
      const e = edit<"agenda">();
      return (
        <>
          <Select
            label="Show"
            value={w.range}
            options={[
              { value: "today", label: "Today Only" },
              { value: "upcoming", label: "The Next Few Days" },
            ]}
            onChange={(v) => e((x) => void (x.range = v))}
          />
          {w.range === "upcoming" && <Stepper label="Days" value={w.days} min={1} max={14} onChange={(v) => e((x) => void (x.days = v))} />}
          <p className="text-xs text-soft">
            Connect calendars under <SettingsLink href="#settings/google">Settings › Google Calendar</SettingsLink> or{" "}
            <SettingsLink href="#settings/icals">Calendar Links</SettingsLink>. Family events come from{" "}
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
            label="Weeks Start On"
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
          <Toggle label="Show Weekends" checked={w.showWeekends} onChange={(v) => e((x) => void (x.showWeekends = v))} />
          <Toggle label="Show the Month Title" checked={w.showTitle} onChange={(v) => e((x) => void (x.showTitle = v))} />
          <Toggle
            label="Open Day Details When Tapped"
            checked={w.showDayDetails}
            onChange={(v) => e((x) => void (x.showDayDetails = v))}
            hint="See every event for that day, including events hidden behind “+N more”."
          />
          <details className="grid gap-3 rounded-xl border border-line bg-bg px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-ink">Advanced Layout</summary>
            <Toggle
              label="Fit Event Titles"
              checked={w.fitTitles}
              onChange={(v) => e((x) => void (x.fitTitles = v))}
              hint="Wrap titles (and shrink if needed) so they are not cut off with an ellipsis. Busy days still show “+N more”."
            />
            <Stepper
              label="Scroll After"
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
      return <Stepper label="Weeks Ahead" value={w.weeks} min={1} max={8} onChange={(v) => e((x) => void (x.weeks = v))} />;
    }
    case "commute": {
      const e = edit<"commute">();
      const places = config.integrations.commute.destinations;
      return (
        <>
          <Toggle label="Show Arrival Time" checked={w.showArrival} onChange={(v) => e((x) => void (x.showArrival = v))} />
          <Toggle label="Show Distance" checked={w.showDistance} onChange={(v) => e((x) => void (x.showDistance = v))} />
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
            label="Map Area"
            value={String(w.zoom)}
            options={[
              { value: "6", label: "Southern B.C." },
              { value: "7", label: "South Coast" },
              { value: "8", label: "Lower Mainland" },
              { value: "9", label: "Fraser Valley" },
              { value: "10", label: "Close to Home" },
            ]}
            onChange={(v) => e((x) => void (x.zoom = Number(v)))}
            hint="The map is centred on the dashboard's location (Settings)."
          />
          <Select
            label="Radar from the Past"
            value={String(w.pastMinutes)}
            options={minutes([30, 60, 90, 120, 180])}
            onChange={(v) => e((x) => void (x.pastMinutes = Number(v)))}
          />
          <Select
            label="Forecast Ahead"
            value={String(w.forecastMinutes)}
            options={minutes([0, 30, 60, 120, 180], "No forecast")}
            onChange={(v) => e((x) => void (x.forecastMinutes = Number(v)))}
            hint="Environment Canada's extrapolation of where the rain is moving."
          />
          <Toggle label="Animate" checked={w.animate} onChange={(v) => e((x) => void (x.animate = v))} />
        </>
      );
    }
    case "wildfires": {
      const e = edit<"wildfires">();
      return (
        <>
          <Select
            label="Map Area"
            value={String(w.zoom)}
            options={[
              { value: "6", label: "Southern B.C." },
              { value: "7", label: "South Coast" },
              { value: "8", label: "Lower Mainland" },
              { value: "9", label: "Fraser Valley" },
              { value: "10", label: "Close to Home" },
            ]}
            onChange={(v) => e((x) => void (x.zoom = Number(v)))}
            hint="The map is centred on the dashboard's location (Settings), on the same map as the rain radar."
          />
          <Toggle label="Burned Areas" checked={w.showPerimeters} onChange={(v) => e((x) => void (x.showPerimeters = v))} />
          <Toggle
            label="Evacuation Orders and Alerts"
            checked={w.showEvacuations}
            onChange={(v) => e((x) => void (x.showEvacuations = v))}
            hint="Orders in red and alerts in amber, for any hazard. Settings › Emergency alerts can also put nearby ones on the red strip."
          />
          <Toggle
            label="Fires Under Control"
            checked={w.showControlled}
            onChange={(v) => e((x) => void (x.showControlled = v))}
            hint="Off shows only new, out-of-control and held fires."
          />
          <Select
            label="Nearest Fires Listed"
            value={String(w.listCount)}
            options={[0, 1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: n === 0 ? "None (Map Only)" : String(n) }))}
            onChange={(v) => e((x) => void (x.listCount = Number(v)))}
          />
          <p className="text-xs text-soft">
            Fires and evacuation areas from BC Wildfire Service and EmergencyInfoBC, updated every five minutes.
          </p>
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
                Use the Dashboard&rsquo;s Location{home.name ? ` (${home.name})` : ""}
              </button>
            )}
          </div>
          <PlaceFinder
            label="Another Place"
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
            label="How Far Out"
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
                  label="Colours Show"
                  value={isPrimary ? w.overlay : w.overlay}
                  options={[
                    ...primary.map((o) => ({ value: o, label: EARTH_OVERLAY_LABELS[o] })),
                    ...(!isPrimary ? [{ value: w.overlay, label: EARTH_OVERLAY_LABELS[w.overlay] }] : []),
                  ]}
                  onChange={(v) => e((x) => void (x.overlay = v))}
                />
                <details className="rounded-xl border border-line bg-bg px-3 py-2" open={!isPrimary}>
                  <summary className="cursor-pointer text-sm font-semibold text-ink">More Colour Layers</summary>
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
            label="Mark the Place"
            checked={w.showPlace}
            hint="A ring on the map, with a small card of its wind and the reading for the colours."
            onChange={(v) => e((x) => void (x.showPlace = v))}
          />
          <Toggle
            label="Animate the Wind"
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
                Use the Dashboard&rsquo;s Location{home.name ? ` (${home.name})` : ""}
              </button>
            )}
          </div>
          <PlaceFinder
            label="Another Place"
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
            label="Map Area"
            value={String(w.zoom)}
            options={[
              { value: "3", label: "North America" },
              { value: "4", label: "Western Canada and the U.S." },
              { value: "5", label: "B.C. and Washington" },
              { value: "6", label: "Southern B.C." },
              { value: "7", label: "South Coast" },
              { value: "8", label: "Lower Mainland" },
              { value: "9", label: "Fraser Valley" },
              { value: "10", label: "Close to Home" },
              { value: "11", label: "The Neighbourhood" },
            ]}
            onChange={(v) => e((x) => void (x.zoom = Number(v)))}
          />
          <Toggle label="Mark the Place" checked={w.marker} onChange={(v) => e((x) => void (x.marker = v))} />
          {windyPressureAllowed(w.overlay) && (
            <Toggle label="Pressure Lines" checked={w.pressure} onChange={(v) => e((x) => void (x.pressure = v))} />
          )}
          <Toggle
            label="Let People Move the Map"
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
          <Stepper label="Sailings per Route" value={w.count} min={1} max={8} onChange={(v) => e((x) => void (x.count = v))} />
          <Toggle label="Show the Ship's Name" checked={w.showVessel} onChange={(v) => e((x) => void (x.showVessel = v))} />
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
    case "borderWait": {
      const e = edit<"borderWait">();
      return (
        <>
          <Select
            label="Directions"
            value={w.directions}
            options={BORDER_DIRECTIONS.map((d) => ({ value: d, label: BORDER_DIRECTION_LABELS[d] }))}
            onChange={(v) => e((x) => void (x.directions = v))}
          />
          <Toggle
            label="NEXUS Lane Waits"
            checked={w.showNexus}
            hint="Under the regular wait, where the agency reports one."
            onChange={(v) => e((x) => void (x.showNexus = v))}
          />
          <p className="text-xs text-soft">
            Car waits from CBSA (into Canada) and U.S. CBP (into the U.S.), which update about hourly. Pick at least one crossing.
          </p>
          {BORDER_CROSSINGS.map((id) => (
            <Toggle
              key={id}
              label={BORDER_INFO[id].name}
              hint={BORDER_INFO[id].detail}
              checked={w.crossings.includes(id)}
              onChange={(on) =>
                e((x) => {
                  // Kept in the list's own order (west to east), and never empty.
                  const next = BORDER_CROSSINGS.filter((c) => (c === id ? on : x.crossings.includes(c)));
                  if (next.length) x.crossings = next;
                })
              }
            />
          ))}
        </>
      );
    }
    case "gasPrices": {
      const e = edit<"gasPrices">();
      return (
        <>
          <Segmented
            label="Fuel"
            value={w.fuel}
            options={GAS_FUELS.map((f) => ({ value: f, label: GAS_FUEL_LABELS[f] }))}
            onChange={(v) => e((x) => void (x.fuel = v))}
          />
          <Range
            label="How Far from Home"
            value={w.radiusKm}
            min={GAS_RADIUS_MIN}
            max={GAS_RADIUS_MAX}
            step={1}
            format={(v) => `${v} km`}
            onChange={(v) => e((x) => void (x.radiusKm = v))}
          />
          <Stepper label="Stations Shown" value={w.count} min={1} max={8} onChange={(v) => e((x) => void (x.count = v))} />
          <Select
            label="Order"
            value={w.sort}
            options={GAS_SORTS.map((o) => ({ value: o, label: GAS_SORT_LABELS[o] }))}
            onChange={(v) => e((x) => void (x.sort = v))}
          />
          <Toggle label="Show Addresses" checked={w.showAddress} onChange={(v) => e((x) => void (x.showAddress = v))} />
          <p className="text-xs text-soft">
            Prices from Google Maps, around the home address under{" "}
            <SettingsLink href="#settings/location">Settings › Location</SettingsLink>. They refresh every two hours, and a price older than
            three days is left out. Google has prices for most, but not all, stations.
          </p>
        </>
      );
    }
    case "sports": {
      const e = edit<"sports">();
      const teams = config.integrations.sports.teams;
      return (
        <>
          <Toggle
            label="Show the Last Result"
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
              { value: "auto", label: "Smart: Fill Unless It Would Crop a Lot" },
              { value: "cover", label: "Fill the Space (Crops Edges)" },
              { value: "contain", label: "Show the Whole Photo" },
            ]}
            onChange={(v) => e((x) => void (x.fit = v))}
          />
          <Toggle
            label="Pair Portrait Photos Side by Side"
            checked={w.pairPortraits}
            onChange={(v) => e((x) => void (x.pairPortraits = v))}
          />
          <Toggle label="Slow Zoom Across Each Photo" checked={w.drift} onChange={(v) => e((x) => void (x.drift = v))} />
          <Toggle label="Show “On This Day” Photos First" checked={w.memories} onChange={(v) => e((x) => void (x.memories = v))} />
          <Toggle label="Show When Each Photo Was Taken" checked={w.showCaption} onChange={(v) => e((x) => void (x.showCaption = v))} />
          <p className="text-xs text-soft">Photos added since the screen last looked always come up next.</p>
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
          <Stepper label="Notes Shown" value={w.count} min={1} max={20} onChange={(v) => e((x) => void (x.count = v))} />
          <Toggle
            label="Post from the Wall"
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
              label: n === 1 ? "Today (Tomorrow from 8 PM)" : n === 7 ? "The Week" : `The next ${n} days`,
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
            label="School Slug"
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
          <Toggle label="Rain Today" checked={w.showRain} onChange={(v) => e((x) => void (x.showRain = v))} />
          <p className="text-sm text-soft">
            Set station id and token under <SettingsLink href="#settings/weather-stations">Settings › Weather Stations</SettingsLink>.
          </p>
        </>
      );
    }
    case "airthings":
      return <AirthingsSettings w={w} onChange={edit<"airthings">()} />;
    case "laundry":
      return <LaundrySettings w={w} onChange={edit<"laundry">()} />;
    case "rivers":
      return <RiversSettings w={w} onChange={edit<"rivers">()} />;
    case "rachio":
      return <RachioSettings w={w} onChange={edit<"rachio">()} />;
    case "blueRiiot":
      return <PoolSettings w={w} onChange={edit<"blueRiiot">()} />;
    case "ecoflow":
      return <EcoFlowSettings w={w} e={edit<"ecoflow">()} />;
    case "unifi": {
      const e = edit<"unifi">();
      return (
        <>
          <UnifiSitePicker value={w.siteId} onChange={(v) => e((x) => void (x.siteId = v))} />
          <Stepper
            label="Slow From"
            value={w.slowMs}
            min={20}
            max={1000}
            step={10}
            format={(v) => `${v} ms`}
            hint="Latency at or above this shows the internet as slow."
            onChange={(v) => e((x) => void (x.slowMs = v))}
          />
          <Toggle label="Latency Chart (24 H)" checked={w.showChart} onChange={(v) => e((x) => void (x.showChart = v))} />
          <Toggle label="Devices and Clients" checked={w.showCounts} onChange={(v) => e((x) => void (x.showCounts = v))} />
          <Toggle
            label="Current Usage"
            checked={w.showUsage}
            hint="What the home downloaded and uploaded in the last five minutes; not a speed test."
            onChange={(v) => e((x) => void (x.showUsage = v))}
          />
          <p className="text-sm text-soft">
            Save the Site Manager API key under <SettingsLink href="#settings/unifi">Settings › UniFi Network</SettingsLink>.
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
            Set station id under <SettingsLink href="#settings/weather-stations">Settings › Weather Stations</SettingsLink>.
          </p>
        </>
      );
    }
    case "shopping": {
      const e = edit<"shopping">();
      return (
        <>
          <Stepper label="Items Shown" value={w.count} min={1} max={40} onChange={(v) => e((x) => void (x.count = v))} />
          <Toggle label="Show Bought Items" checked={w.showDone} onChange={(v) => e((x) => void (x.showDone = v))} />
          <Toggle
            label="Tap to Tick Off"
            hint="Anyone at the screen can mark an item bought. Tapping it again puts it back."
            checked={w.allowCheck}
            onChange={(v) => e((x) => void (x.allowCheck = v))}
          />
          <Toggle
            label="Add from the Wall"
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
          <Stepper label="Tasks Shown" value={w.count} min={1} max={30} onChange={(v) => e((x) => void (x.count = v))} />
          <Toggle label="Show Due Dates" checked={w.showDue} onChange={(v) => e((x) => void (x.showDue = v))} />
          <Toggle
            label="Tap to Tick Off"
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
              { value: "columns", label: "Columns (List)" },
              { value: "byPeriod", label: "By Time of Day" },
              { value: "progress", label: "Progress Rings" },
            ]}
            onChange={(v) => e((x) => void (x.layout = v))}
          />
          <Toggle label="Show Stars" checked={w.showStars} onChange={(v) => e((x) => void (x.showStars = v))} />
          <Toggle
            label="Tap to Tick Off"
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
        <Toggle label="Say “No Alerts” When All Is Clear" checked={w.showAllClear} onChange={(v) => e((x) => void (x.showAllClear = v))} />
      );
    }
    case "camera": {
      const e = edit<"camera">();
      return (
        <>
          <Text
            label="Camera Entity"
            value={w.entityId}
            maxLength={255}
            placeholder="camera.front_door"
            list="ha-cameras"
            onChange={(v) => e((x) => void (x.entityId = v.trim()))}
          />
          <HaEntityList id="ha-cameras" only="camera." />
          <Range
            label="Refresh Every"
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
    case "drivebc": {
      const e = edit<"drivebc">();
      return (
        <>
          <DriveBcCameras
            cameras={w.cameras}
            onAdd={(c) => e((x) => void (x.cameras = [...x.cameras, c]))}
            onRemove={(id) => e((x) => void (x.cameras = x.cameras.filter((c) => c.id !== id)))}
          />
          <Range
            label="New Picture Every"
            value={w.refreshSeconds}
            min={DRIVEBC_REFRESH.min}
            max={DRIVEBC_REFRESH.max}
            step={30}
            format={(n) => (n < 120 ? `${n} s` : `${Math.round(n / 60)} min`)}
            hint="Lower Mainland cameras take a new picture every two to 15 minutes, so faster only shows the same one again."
            onChange={(v) => e((x) => void (x.refreshSeconds = v))}
          />
          <Select
            label="Layout"
            value={w.layout}
            options={[
              { value: "grid", label: "All Cameras Side by Side" },
              { value: "cycle", label: "One Camera at a Time" },
            ]}
            onChange={(v) => e((x) => void (x.layout = v))}
          />
          {w.layout === "cycle" && (
            <Range
              label="Next Camera After"
              value={w.cycleSeconds}
              min={5}
              max={120}
              step={5}
              format={(n) => `${n} s`}
              onChange={(v) => e((x) => void (x.cycleSeconds = v))}
            />
          )}
          <Toggle label="Show Camera Names" checked={w.showName} onChange={(v) => e((x) => void (x.showName = v))} />
        </>
      );
    }
    case "transit": {
      const e = edit<"transit">();
      // The dashboard's region's agencies come first, marked, so a Toronto household sees the TTC on top.
      const local = regionOf(config).transit;
      const agencies = [...local, ...TRANSIT_AGENCY_IDS.filter((a) => !local.includes(a))];
      return (
        <>
          <Select
            label="Agency"
            value={w.agency}
            options={agencies.map((a) => ({
              value: a,
              label: `${TRANSIT_AGENCIES[a].name} (${TRANSIT_AGENCIES[a].area})${local.includes(a) ? " · your region" : ""}`,
            }))}
            hint="Stops belong to one agency, so changing it clears the stops."
            onChange={(v) =>
              e((x) => {
                if (x.agency === v) return;
                x.agency = v;
                x.stops = [];
                x.routes = [];
              })
            }
          />
          <TransitStops
            key={w.agency}
            agency={w.agency}
            stops={w.stops}
            onAdd={(s) => e((x) => void (x.stops = [...x.stops, s]))}
            onRemove={(id) => e((x) => void (x.stops = x.stops.filter((s) => s.id !== id)))}
          />
          <RoutesField routes={w.routes} onChange={(routes) => e((x) => void (x.routes = routes))} />
          <Stepper label="Departures per Stop" value={w.count} min={1} max={12} onChange={(v) => e((x) => void (x.count = v))} />
          <Range
            label="Walk to the Stop"
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
            label="Player From"
            value={w.provider}
            options={[
              { value: "homeAssistant", label: "Home Assistant" },
              { value: "spotify", label: "Spotify (Signed in Directly)" },
              { value: "sonos", label: "Sonos (Signed in Directly)" },
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
          <Toggle label="Album Art" checked={w.showArt} onChange={(v) => e((x) => void (x.showArt = v))} />
          <Toggle label="Volume" checked={w.showVolume} onChange={(v) => e((x) => void (x.showVolume = v))} />
          <Toggle
            label="Sources to Play"
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
            label="Long Break"
            value={w.longBreakMinutes}
            min={1}
            max={90}
            step={1}
            format={(n) => `${n} min`}
            onChange={(v) => e((x) => void (x.longBreakMinutes = v))}
          />
          <Stepper
            label="Focus Rounds Before the Long Break"
            value={w.rounds}
            min={1}
            max={12}
            onChange={(v) => e((x) => void (x.rounds = v))}
          />
          <Toggle
            label="Start the Next Phase by Itself"
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
              Add a Person
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
            The district page is set under <SettingsLink href="#settings/school">Settings › School Status</SettingsLink>.
          </p>
        </>
      );
    }
    case "schoolDays": {
      const e = edit<"schoolDays">();
      return (
        <>
          <Stepper label="Days Off Listed" value={w.count} min={0} max={6} onChange={(v) => e((x) => void (x.count = v))} />
          <Toggle label="Show Hot Lunch" checked={w.showLunch} onChange={(v) => e((x) => void (x.showLunch = v))} />
          <p className="text-xs text-soft">
            The school year, days off and lunches are set under{" "}
            <SettingsLink href="#settings/school-days">Settings › School Days</SettingsLink>.
          </p>
        </>
      );
    }
    case "packages": {
      const e = edit<"packages">();
      return (
        <>
          <Stepper label="Packages Shown" value={w.count} min={1} max={12} onChange={(v) => e((x) => void (x.count = v))} />
          <Toggle label="Only Today's Deliveries" checked={w.todayOnly} onChange={(v) => e((x) => void (x.todayOnly = v))} />
          <Toggle
            label="Show Packages Delivered Before Today"
            checked={w.showDelivered}
            onChange={(v) => e((x) => void (x.showDelivered = v))}
          />
          {w.packages.map((p, i) => (
            <div key={p.id} className="grid gap-2 rounded-xl border border-line p-3">
              <Select
                label="Carrier"
                value={p.carrier}
                options={[
                  { value: "other", label: "Work It Out from the Number" },
                  { value: "canadaPost", label: "Canada Post" },
                  { value: "purolator", label: "Purolator" },
                  { value: "ups", label: "UPS" },
                  { value: "fedex", label: "FedEx" },
                  { value: "dhl", label: "DHL" },
                  { value: "usps", label: "USPS" },
                ]}
                onChange={(v) => e((x) => void (x.packages[i]!.carrier = v))}
              />
              <Text
                label="Tracking Number"
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
              onClick={() => e((x) => void x.packages.push({ id: newId("pkg"), carrier: "other", trackingNumber: "", label: "" }))}
            >
              Add a Package
            </button>
          )}
          <PackagesHint />
        </>
      );
    }
    case "snow": {
      const e = edit<"snow">();
      return (
        <>
          <p className="text-xs text-soft">Mountains to show, in this order. Keep at least one.</p>
          {MOUNTAINS.map((m) => (
            <Toggle
              key={m.id}
              label={m.name}
              checked={w.mountains.includes(m.id)}
              onChange={(on) =>
                e((x) => {
                  const next = on
                    ? MOUNTAINS.map((r) => r.id).filter((id) => id === m.id || x.mountains.includes(id))
                    : x.mountains.filter((id) => id !== m.id);
                  if (next.length) x.mountains = next;
                })
              }
            />
          ))}
          <Toggle label="Snow Depth" checked={w.showDepth} onChange={(v) => e((x) => void (x.showDepth = v))} />
          <Toggle
            label="Snowfall Today and the Next Two Days"
            checked={w.showForecast}
            onChange={(v) => e((x) => void (x.showForecast = v))}
          />
          <Toggle
            label="Temperature on the Mountain"
            checked={w.showTemperature}
            onChange={(v) => e((x) => void (x.showTemperature = v))}
          />
          <p className="text-xs text-soft">
            From Open-Meteo&apos;s weather model at each mountain&apos;s mid-mountain height, not the resorts&apos; own snow reports.
          </p>
        </>
      );
    }
    case "tides": {
      const e = edit<"tides">();
      return (
        <>
          <p className="text-sm">
            Station: <strong>{w.stationName || "none picked"}</strong>
            {w.stationId ? <span className="text-soft"> ({w.stationId})</span> : null}
          </p>
          <PlaceFinder
            label="Find a Station"
            button="Find"
            placeholder="White Rock, Crescent Beach, Seattle…"
            nothing="No tide station by that name. Try a nearby harbour or beach."
            url={(q) => `/api/household/tide-stations/?${new URLSearchParams({ q })}`}
            onPick={(p) =>
              e((x) => {
                if (!p.id) return;
                x.stationId = p.id;
                x.stationName = p.label.replace(/\s*\([^)]*\)$/, "").slice(0, 80);
              })
            }
          />
          <Stepper label="Highs and Lows Shown" value={w.count} min={1} max={8} onChange={(v) => e((x) => void (x.count = v))} />
          <Toggle label="Show Height" checked={w.showHeight} onChange={(v) => e((x) => void (x.showHeight = v))} />
          <Toggle
            label="Show the Day's Curve"
            checked={w.showCurve}
            hint="The predicted water level from two hours ago to tomorrow, with a line at now."
            onChange={(v) => e((x) => void (x.showCurve = v))}
          />
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
            label="Symbols (Comma-Separated)"
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
          <Toggle label="Show Daily Change %" checked={w.showChange} onChange={(v) => e((x) => void (x.showChange = v))} />
        </>
      );
    }
    case "crypto": {
      const e = edit<"crypto">();
      return (
        <>
          <Text
            label="CoinGecko Ids"
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
          <Text label="Quote Currency" value={w.vs} maxLength={3} onChange={(v) => e((x) => void (x.vs = v.toLowerCase().slice(0, 3)))} />
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
          <Text label="Place or Query" value={w.query} maxLength={200} onChange={(v) => e((x) => void (x.query = v))} />
          <Stepper label="Zoom" value={w.zoom} min={1} max={20} onChange={(v) => e((x) => void (x.zoom = v))} />
        </>
      );
    }
    case "youtube":
    case "vimeo": {
      const e = edit<"youtube" | "vimeo">();
      return <Text label="Video or Playlist ID" value={w.videoId} maxLength={64} onChange={(v) => e((x) => void (x.videoId = v))} />;
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
            label="Extra Lines (One per Row)"
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
    case "oura": {
      const e = edit<"oura">();
      return (
        <>
          <Toggle label="Sleep Score" checked={w.showSleep} onChange={(v) => e((x) => void (x.showSleep = v))} />
          <Toggle label="Readiness Score" checked={w.showReadiness} onChange={(v) => e((x) => void (x.showReadiness = v))} />
          <Toggle label="Activity Score and Steps" checked={w.showActivity} onChange={(v) => e((x) => void (x.showActivity = v))} />
          <Toggle
            label="Show Last Night's Details"
            checked={w.showDetails}
            hint="Hours asleep, bedtime, HRV and lowest heart rate. Anyone in the kitchen can read the wall, so this is off unless you turn it on."
            onChange={(v) => e((x) => void (x.showDetails = v))}
          />
          <p className="text-xs text-soft">Connect the ring&apos;s Oura account in Settings › Content &amp; finance.</p>
        </>
      );
    }
    case "moon": {
      const e = edit<"moon">();
      return (
        <>
          <Toggle label="Show the Next Full and New Moon" checked={w.showNext} onChange={(v) => e((x) => void (x.showNext = v))} />
          <Toggle
            label="Name the Full Moon"
            checked={w.showName}
            hint="The traditional names, like Cold Moon in December and the Harvest Moon nearest the fall equinox."
            onChange={(v) => e((x) => void (x.showName = v))}
          />
          <p className="text-xs text-soft">Worked out on the screen itself, so it needs no connection.</p>
        </>
      );
    }
    case "aurora": {
      const e = edit<"aurora">();
      return (
        <>
          <Toggle
            label="Show the Next 24 Hours"
            checked={w.showBlocks}
            hint="A bar for each three-hour block of NOAA's Kp forecast; bars high enough to see it from home are coloured."
            onChange={(v) => e((x) => void (x.showBlocks = v))}
          />
          <p className="text-xs text-soft">
            The chance is worked out for {config.location.name || "the dashboard's location"} from NOAA&apos;s Kp forecast. It still needs a
            clear, dark sky to the north.
          </p>
        </>
      );
    }
    case "brief": {
      const e = edit<"brief">();
      return (
        <>
          <Segmented
            label="Show It As"
            value={w.layout}
            options={[
              { value: "sentence", label: "A Sentence" },
              { value: "list", label: "A List" },
            ]}
            onChange={(v) => e((x) => void (x.layout = v))}
          />
          <p className="text-xs text-soft">
            What to mention. Each one only speaks up when there&apos;s something to say, and only from what the dashboard already reads:
            ferries from a Ferries widget, school closures from a School status widget, garbage day once your zone is set.
          </p>
          {BRIEF_SOURCES.map((k) => (
            <Toggle
              key={k}
              label={BRIEF_SOURCE_LABELS[k]}
              checked={w.sources.includes(k)}
              onChange={(on) =>
                e((x) => {
                  const next = on ? BRIEF_SOURCES.filter((r) => r === k || x.sources.includes(r)) : x.sources.filter((r) => r !== k);
                  if (next.length) x.sources = next;
                })
              }
            />
          ))}
          <Stepper label="Calendar Events to Name" value={w.events} min={1} max={5} onChange={(v) => e((x) => void (x.events = v))} />
          <Toggle
            label="Read Tomorrow in the Evening"
            checked={w.eveningTomorrow}
            hint="From 7 PM it reads tomorrow's weather, plans and bins instead of what's left of today."
            onChange={(v) => e((x) => void (x.eveningTomorrow = v))}
          />
          <p className="text-xs text-soft">Changes to what it mentions show on the wall after you publish.</p>
        </>
      );
    }
    case "onThisDay": {
      const e = edit<"onThisDay">();
      return (
        <>
          <Segmented
            label="Show"
            value={w.kind}
            options={[
              { value: "events", label: "Events" },
              { value: "births", label: "Birthdays" },
            ]}
            onChange={(v) => e((x) => void (x.kind = v))}
          />
          <Stepper label="How Many" value={w.count} min={1} max={5} onChange={(v) => e((x) => void (x.count = v))} />
          <Toggle
            label="Family Friendly"
            checked={w.familyFriendly}
            hint="Leaves out wars, disasters and crimes, which is much of history. It errs on leaving things out."
            onChange={(v) => e((x) => void (x.familyFriendly = v))}
          />
          <p className="text-xs text-soft">From Wikipedia&apos;s &ldquo;On this day&rdquo;; the same picks show all day on every screen.</p>
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
            label="Check the Ping Every"
            value={String(w.pingSeconds)}
            options={[
              { value: "10", label: "10 Seconds" },
              { value: "30", label: "30 Seconds" },
              { value: "60", label: "Minute" },
              { value: "300", label: "5 Minutes" },
            ]}
            onChange={(v) => e((x) => void (x.pingSeconds = Number(v)))}
          />
          <Stepper
            label="Slow Above"
            value={w.slowMs}
            min={20}
            max={2000}
            step={10}
            format={(n) => `${n} ms`}
            hint="A ping above this shows as Slow. A good home line is under 30 ms to Cloudflare."
            onChange={(v) => e((x) => void (x.slowMs = v))}
          />
          <Select
            label="Speed Test"
            value={String(w.speedHours)}
            options={[
              { value: "0", label: "Only When Someone Taps the Widget" },
              { value: "1", label: "Every Hour" },
              { value: "3", label: "Every 3 Hours" },
              { value: "6", label: "Every 6 Hours" },
              { value: "12", label: "Every 12 Hours" },
              { value: "24", label: "Once a Day" },
            ]}
            hint="A test downloads about 11 MB on a slow line and up to about 60 MB on a fast one. A tap on the widget runs one now."
            onChange={(v) => e((x) => void (x.speedHours = Number(v)))}
          />
          <Toggle
            label="Upload Speed Too"
            checked={w.upload}
            hint="Sends up to about 12 MB more."
            onChange={(v) => e((x) => void (x.upload = v))}
          />
          <Toggle label="Ping Graph" checked={w.showGraph} onChange={(v) => e((x) => void (x.showGraph = v))} />
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
      label="Only These Schools"
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
        label="Full-Screen Alert"
        checked={w.fullScreen}
        hint="Flashes the whole screen with what's done, until someone taps."
        onChange={(v) => onChange((x) => void (x.fullScreen = v))}
      />
      <Range
        label="Stop Alerting After"
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
  { label: "1 Min", seconds: 60 },
  { label: "3 Min", seconds: 180 },
  { label: "5 Min", seconds: 300 },
  { label: "10 Min", seconds: 600 },
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
          Add a Timer Button
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
        label="Seconds per Photo"
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
        <Range label="Custom Interval" value={value} min={5} max={3600} step={5} format={(n) => `${n} s`} onChange={onChange} />
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
    { value: "", label: "Pick a Speaker" },
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

// Square-ish photos for a date's round picture (Melvin, 2026-11-26); 800 px is plenty for the day's large circle.
const COUNTDOWN_PHOTO_SIDE = 800;

function CountdownPhoto({ photo, onChange }: { photo: string | undefined; onChange: (id: string | undefined) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function upload(file: File | undefined) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const { blob, w, h } = await shrink(file, COUNTDOWN_PHOTO_SIDE);
      const r = await fetch("/api/household/countdown-photo/", {
        method: "POST",
        headers: { "Content-Type": "image/jpeg", "x-photo-width": String(w), "x-photo-height": String(h) },
        body: blob,
      });
      const body = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!r.ok || !body.id) throw new Error(body.error ?? "Couldn't upload that photo.");
      onChange(body.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload that photo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex items-center gap-3">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- a private photo through our own route, not a static asset
        <img
          src={`/api/display/countdown-photo/?i=${encodeURIComponent(photo)}`}
          alt=""
          className="size-12 flex-none rounded-full border border-line object-cover"
        />
      ) : (
        <span className="grid size-12 flex-none place-items-center rounded-full border border-dashed border-line text-xs text-soft">
          Photo
        </span>
      )}
      <label className="btn-ghost cursor-pointer">
        {busy ? "Uploading…" : photo ? "Change Photo" : "Add a Photo"}
        <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} />
      </label>
      {photo && !busy && (
        <button type="button" className="btn-ghost text-bad" onClick={() => onChange(undefined)}>
          Remove Photo
        </button>
      )}
      {error && <p className="text-xs text-bad">{error}</p>}
    </div>
  );
}

const COUNTDOWN_HINTS: Partial<Record<CountdownEvent["kind"], string>> = {
  birthday: "Use the date of birth to show the age they turn.",
  anniversary: "Use the wedding (or first) date to show how many years it will be.",
};

function CountdownEvents({ w, onChange }: { w: Extract<Widget, { type: "countdown" }>; onChange: Edit<"countdown"> }) {
  const { events, count } = w;
  return (
    <>
      <Stepper label="Events Shown" value={count} min={1} max={12} onChange={(v) => onChange((x) => void (x.count = v))} />
      <Toggle
        label="Celebrate on the Day"
        checked={w.celebrate !== false}
        hint="On a birthday or anniversary, it leads the tile with its photo large: “Happy birthday, Sam!”"
        onChange={(v) => onChange((x) => void (x.celebrate = v))}
      />
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
                  { value: "anniversary", label: "Anniversary" },
                  { value: "holiday", label: "Holiday" },
                  { value: "event", label: "Event" },
                ]}
                onChange={(v) =>
                  onChange((x) => {
                    const e = x.events[i]!;
                    e.kind = v;
                    if (v === "birthday" || v === "anniversary") e.yearly = true;
                  })
                }
              />
            </div>
            <Toggle
              label="Every Year"
              checked={ev.yearly}
              hint={COUNTDOWN_HINTS[ev.kind]}
              onChange={(v) => onChange((x) => void (x.events[i]!.yearly = v))}
            />
            <CountdownPhoto
              photo={ev.photo}
              onChange={(id) =>
                onChange((x) => {
                  const e = x.events[i]!;
                  if (id) e.photo = id;
                  else delete e.photo;
                })
              }
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
      <div className="flex flex-wrap gap-2">
        {(
          [
            { kind: "birthday", name: "Birthday", emoji: "🎂" },
            { kind: "anniversary", name: "Anniversary", emoji: "💍" },
            { kind: "holiday", name: "Holiday", emoji: "🎉" },
          ] as const
        ).map((t) => (
          <button
            key={t.kind}
            type="button"
            className="btn-ghost"
            disabled={events.length >= 50}
            onClick={() =>
              onChange((x) => {
                x.events.push({
                  id: newId("ev"),
                  name: t.name,
                  date: new Date().toISOString().slice(0, 10),
                  emoji: t.emoji,
                  kind: t.kind,
                  yearly: true,
                });
              })
            }
          >
            Add {t.kind === "holiday" ? "a holiday" : `a ${t.name.toLowerCase()}`}
          </button>
        ))}
      </div>
    </>
  );
}

interface DriveBcMatch {
  id: string;
  name: string;
  caption: string;
  highway: string;
  km: number | null;
}

/** Picked DriveBC cameras, and a search of DriveBC's camera list by name, place or highway (nearest first). */
function DriveBcCameras({
  cameras,
  onAdd,
  onRemove,
}: {
  cameras: { id: string; name: string }[];
  onAdd: (c: { id: string; name: string }) => void;
  onRemove: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<DriveBcMatch[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const full = cameras.length >= DRIVEBC_MAX_CAMERAS;

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setNote("");
    const r = await fetch(`/api/household/drivebc/?${new URLSearchParams({ q: q.trim() })}`).catch(() => null);
    const body = (await r?.json().catch(() => ({}))) as { cameras?: DriveBcMatch[]; error?: string } | undefined;
    setBusy(false);
    setMatches(body?.cameras ?? []);
    if (!r?.ok) setNote(body?.error ?? "Couldn't search DriveBC's cameras.");
  }

  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">Cameras</p>
      {cameras.length === 0 && <p className="text-xs text-soft">No cameras yet. Find one below.</p>}
      {cameras.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
          <span className="min-w-0 truncate">{c.name}</span>
          <button type="button" className="btn-ghost" onClick={() => onRemove(c.id)}>
            Remove
          </button>
        </div>
      ))}
      {!full && (
        <form className="flex items-end gap-2" onSubmit={(e) => void search(e)}>
          <div className="min-w-0 flex-1">
            <Text
              label="Find a Camera"
              value={q}
              maxLength={60}
              placeholder="Port Mann, Hwy 1, Coquihalla; empty for the nearest"
              onChange={setQ}
            />
          </div>
          <button className="btn-primary" disabled={busy}>
            {busy ? "Finding…" : "Find"}
          </button>
        </form>
      )}
      {note && <p className="text-xs text-soft">{note}</p>}
      {matches && !full && (
        <div className="grid gap-1">
          {matches.length === 0 && !note && <p className="text-xs text-soft">No cameras matched.</p>}
          {matches
            .filter((m) => !cameras.some((c) => c.id === m.id))
            .map((m) => (
              <button
                key={m.id}
                type="button"
                className="btn-ghost justify-start text-left"
                title={m.caption}
                onClick={() => onAdd({ id: m.id, name: m.name })}
              >
                {m.name} {m.highway && <span className="text-soft">· Hwy {m.highway}</span>}
                {m.km !== null && <span className="text-soft"> · {m.km} km</span>}
              </button>
            ))}
        </div>
      )}
      <p className="text-xs text-soft">
        Up to {DRIVEBC_MAX_CAMERAS} cameras. {DRIVEBC_LICENCE}
      </p>
    </div>
  );
}

interface StopMatch {
  id: string;
  code: string;
  name: string;
  km: number;
}
type TransitStop = { id: string; code: string; name: string };

/** Finds an agency's stops by the number on the stop's sign or by name; with nothing typed, the ones nearest home. */
function TransitStops({
  agency,
  stops,
  onAdd,
  onRemove,
}: {
  agency: TransitAgencyId;
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
    const r = await fetch(`/api/household/transit/?${new URLSearchParams({ q: q.trim(), agency })}`).catch(() => null);
    const body = (await r?.json().catch(() => ({}))) as { stops?: StopMatch[]; keySet?: boolean; error?: string } | undefined;
    setBusy(false);
    setMatches(body?.stops ?? []);
    if (!r?.ok) setNote(body?.error ?? `Couldn't search ${agencyOf(agency).name}'s stops.`);
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
            <Text label="Find a Stop" value={q} maxLength={60} placeholder="Stop number or name; empty for the nearest" onChange={setQ} />
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
      {agencyOf(agency).notice && <p className="text-xs text-soft">{agencyOf(agency).notice}</p>}
    </div>
  );
}

/** Route numbers to show, typed as "502, 503"; kept as typed until it parses, so a trailing comma isn't eaten. */
function RoutesField({ routes, onChange }: { routes: string[]; onChange: (routes: string[]) => void }) {
  const [text, setText] = useState(routes.join(", "));
  return (
    <Text
      label="Only These Routes"
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

function RiversSettings({ w, onChange }: { w: Extract<Widget, { type: "rivers" }>; onChange: Edit<"rivers"> }) {
  const [number, setNumber] = useState("");
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState("");
  const full = w.stations.length >= 6;
  const presetName = (id: string) => RIVER_PRESETS.find((p) => p.id === id)?.name;
  const add = async () => {
    const id = number.trim().toUpperCase();
    if (!RIVER_STATION_RE.test(id)) return setNote("A station number looks like 08MH024: two digits, two letters, three digits.");
    if (w.stations.some((s) => s.id === id)) return setNote("That station is already on the widget.");
    setChecking(true);
    setNote("");
    try {
      const r = await fetch(`/api/household/river-stations/?id=${encodeURIComponent(id)}`);
      const body = (await r.json()) as { station: { name: string } | null; error?: string };
      if (!body.station) return setNote(body.error ?? "No real-time readings at that station number.");
      onChange((x) => void x.stations.push({ id, label: "" }));
      setNumber("");
      setNote(`Added ${body.station.name}.`);
    } catch {
      setNote("Couldn't check that station just now.");
    } finally {
      setChecking(false);
    }
  };
  return (
    <>
      <p className="text-xs text-soft">
        Live gauges from Environment Canada, up to six. Levels are metres above each gauge&apos;s own zero, so compare a river with itself,
        not with another river. Flood warnings still come through the alert strip.
      </p>
      {RIVER_PRESETS.map((p) => (
        <Toggle
          key={p.id}
          label={p.name}
          checked={w.stations.some((s) => s.id === p.id)}
          onChange={(on) =>
            onChange((x) => {
              if (!on) x.stations = x.stations.filter((s) => s.id !== p.id);
              else if (x.stations.length < 6 && !x.stations.some((s) => s.id === p.id)) x.stations.push({ id: p.id, label: "" });
            })
          }
        />
      ))}
      {w.stations.map((s, i) => (
        <div key={s.id} className="grid gap-2">
          <Text
            label={`${presetName(s.id) ?? "Station"} (${s.id})`}
            value={s.label}
            maxLength={60}
            placeholder="Name on the wall (optional)"
            onChange={(v) => onChange((x) => void (x.stations[i]!.label = v))}
          />
          <button
            type="button"
            className="btn-ghost justify-self-start text-bad"
            onClick={() => onChange((x) => void x.stations.splice(i, 1))}
          >
            Remove
          </button>
        </div>
      ))}
      {!full && (
        <>
          <Text
            label="Add Another Station by Number"
            value={number}
            maxLength={7}
            placeholder="08MH024"
            hint="Find numbers on Environment Canada's real-time hydrometric map (wateroffice.ec.gc.ca)."
            onChange={setNumber}
          />
          <button type="button" className="btn-ghost justify-self-start" disabled={checking || !number.trim()} onClick={() => void add()}>
            {checking ? "Checking…" : "Add Station"}
          </button>
        </>
      )}
      {note && <p className="text-xs text-soft">{note}</p>}
      <Toggle label="Show the Day's Line" checked={w.showChart} onChange={(v) => onChange((x) => void (x.showChart = v))} />
      <Toggle label="Show Flow (Where Measured)" checked={w.showDischarge} onChange={(v) => onChange((x) => void (x.showDischarge = v))} />
    </>
  );
}

function AirthingsSettings({ w, onChange }: { w: Extract<Widget, { type: "airthings" }>; onChange: Edit<"airthings"> }) {
  const status = useAirthings();
  return (
    <>
      <p className="text-xs text-soft">Readings to show, where the device has them (a Wave Radon has no CO₂).</p>
      {AIRTHINGS_KINDS.map((k) => (
        <Toggle
          key={k}
          label={AIRTHINGS_LABELS[k]}
          checked={w.readings.includes(k)}
          onChange={(on) =>
            onChange((x) => {
              const next = on ? AIRTHINGS_KINDS.filter((r) => r === k || x.readings.includes(r)) : x.readings.filter((r) => r !== k);
              if (next.length) x.readings = next;
            })
          }
        />
      ))}
      {!status ? null : !status.configured ? (
        <p className="text-xs text-soft">
          Connect Airthings under <SettingsLink href="#settings/indoor-air">Settings › Indoor Air</SettingsLink>.
        </p>
      ) : status.devices.length === 0 ? (
        <p className="text-xs text-soft">{status.error || "Airthings lists no devices yet."}</p>
      ) : (
        <>
          <p className="text-xs text-soft">Pick the devices to show. With none picked, it shows them all.</p>
          {status.devices.map((d) => (
            <Toggle
              key={d.serial}
              label={d.name}
              checked={w.devices.includes(d.serial)}
              onChange={(on) => onChange((x) => void (x.devices = on ? [...x.devices, d.serial] : x.devices.filter((s) => s !== d.serial)))}
            />
          ))}
        </>
      )}
    </>
  );
}

function PoolSettings({ w, onChange }: { w: Extract<Widget, { type: "blueRiiot" }>; onChange: Edit<"blueRiiot"> }) {
  const status = usePools();
  // A pool saved earlier that the account no longer lists still shows, so it can be switched off.
  const listed = status?.pools ?? [];
  const pools = [...listed, ...w.pools.filter((id) => !listed.some((p) => p.id === id)).map((id) => ({ id, name: id }))];
  return (
    <>
      <p className="text-xs text-soft">Readings to show, where the pool has them (free chlorine only after a test strip in the app).</p>
      {POOL_KINDS.map((k) => (
        <Toggle
          key={k}
          label={POOL_LABELS[k]}
          checked={w.readings.includes(k)}
          onChange={(on) =>
            onChange((x) => {
              const next = on ? POOL_KINDS.filter((r) => r === k || x.readings.includes(r)) : x.readings.filter((r) => r !== k);
              if (next.length) x.readings = next;
            })
          }
        />
      ))}
      {!status ? null : !status.configured ? (
        <p className="text-xs text-soft">
          Connect Blue Riiot under <SettingsLink href="#settings/pool">Settings › Pool</SettingsLink>.
        </p>
      ) : pools.length === 0 ? (
        <p className="text-xs text-soft">{status.error || "Blue Riiot lists no pools yet."}</p>
      ) : pools.length > 1 ? (
        <>
          <p className="text-xs text-soft">Pick the pools to show. With none picked, it shows them all.</p>
          {pools.map((p) => (
            <Toggle
              key={p.id}
              label={p.name}
              checked={w.pools.includes(p.id)}
              onChange={(on) => onChange((x) => void (x.pools = on ? [...x.pools, p.id] : x.pools.filter((s) => s !== p.id)))}
            />
          ))}
        </>
      ) : null}
    </>
  );
}

function PackagesHint() {
  const status = usePackages();
  if (!status) return null;
  return status.configured && !status.error ? (
    <p className="text-xs text-soft">Live status from 17TRACK. Each new number uses one of the key&apos;s tracking quota.</p>
  ) : (
    <p className="text-xs text-soft">
      {status.error || "Numbers show without live status until a 17TRACK key is saved."}{" "}
      <a className="underline" href="#settings/packages">
        Settings › Packages
      </a>
    </p>
  );
}

function RachioSettings({ w, onChange }: { w: Extract<Widget, { type: "rachio" }>; onChange: Edit<"rachio"> }) {
  const status = useRachio();
  // A controller saved earlier that the account no longer lists still shows, so it can be switched off.
  const listed = status?.controllers ?? [];
  const controllers = [...listed, ...w.devices.filter((id) => !listed.some((c) => c.id === id)).map((id) => ({ id, name: id }))];
  return (
    <>
      <Toggle
        label="Skip from the Wall"
        checked={w.allowSkip}
        hint="A Skip button on the next watering. Anyone in the kitchen can tap it."
        onChange={(v) => onChange((x) => void (x.allowSkip = v))}
      />
      <Toggle label="Show Zones" checked={w.showZones} onChange={(v) => onChange((x) => void (x.showZones = v))} />
      {!status ? null : !status.configured ? (
        <p className="text-xs text-soft">
          Connect Rachio under <SettingsLink href="#settings/sprinklers">Settings › Sprinklers</SettingsLink>.
        </p>
      ) : controllers.length === 0 ? (
        <p className="text-xs text-soft">{status.error || "Rachio lists no controllers yet."}</p>
      ) : controllers.length > 1 ? (
        <>
          <p className="text-xs text-soft">Pick the controllers to show. With none picked, it shows them all.</p>
          {controllers.map((c) => (
            <Toggle
              key={c.id}
              label={c.name}
              checked={w.devices.includes(c.id)}
              onChange={(on) => onChange((x) => void (x.devices = on ? [...x.devices, c.id] : x.devices.filter((s) => s !== c.id)))}
            />
          ))}
        </>
      ) : null}
    </>
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
      <Toggle label="Solar Input" checked={w.showSolar} onChange={(v) => e((x) => void (x.showSolar = v))} />
      <Toggle label="AC and DC in and Out" checked={w.showFlows} onChange={(v) => e((x) => void (x.showFlows = v))} />
      <Toggle label="Time to Full or Empty" checked={w.showTime} onChange={(v) => e((x) => void (x.showTime = v))} />
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

function LaundrySettings({ w, onChange }: { w: Extract<Widget, { type: "laundry" }>; onChange: Edit<"laundry"> }) {
  const status = useLaundry();
  return (
    <>
      <Toggle
        label="Show Machines That Are Idle or Off"
        checked={w.showIdle}
        hint="Off: only running, paused and done machines."
        onChange={(v) => onChange((x) => void (x.showIdle = v))}
      />
      {!status ? null : !status.lg && !status.smartthings ? (
        <p className="text-xs text-soft">
          Connect LG ThinQ or SmartThings under <SettingsLink href="#settings/laundry">Settings › Laundry</SettingsLink>.
        </p>
      ) : status.machines.length === 0 ? (
        <p className="text-xs text-soft">{status.error || "No washers or dryers found yet."}</p>
      ) : (
        <>
          <p className="text-xs text-soft">Pick the machines to show. With none picked, it shows them all.</p>
          {status.machines.map((m) => (
            <Toggle
              key={m.id}
              label={m.name}
              checked={w.appliances.includes(m.id)}
              onChange={(on) =>
                onChange((x) => void (x.appliances = on ? [...x.appliances, m.id] : x.appliances.filter((a) => a !== m.id)))
              }
            />
          ))}
        </>
      )}
    </>
  );
}
