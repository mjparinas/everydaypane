"use client";

import { useState, type ReactNode } from "react";

import type { CountdownEvent, DashboardConfig, TimerPreset, Widget } from "@/lib/config/schema";
import { WIDGETS } from "@/lib/config/widgets";
import { EARTH_OVERLAY_LABELS, EARTH_OVERLAYS, EARTH_ZOOM_LABELS, EARTH_ZOOMS } from "@/lib/earth";
import { FERRY_ROUTES, ferryRouteName } from "@/lib/ferries";
import { MEAL_LABELS, MEAL_SLOTS } from "@/lib/meals";

import { PlaceFinder } from "./CommutePanel";
import { Range, Segmented, Select, Stepper, Text, TextArea, Toggle } from "./fields";
import { HaEntityList } from "./haEntities";
import { useMusic } from "./music";
import { newId } from "./store";

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
    case "sunTimes": {
      const e = edit<"sunTimes">();
      return (
        <>
          <Toggle
            label="Transparent background"
            checked={w.transparent}
            hint="No panel, like the clock and date. Handy over a photos widget."
            onChange={(v) => e((x) => void (x.transparent = v))}
          />
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
            Weather is for {config.location.name || "the dashboard's location"} (
            <SettingsLink href="#settings/location">Settings › Location</SettingsLink>).
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
            url={(q) => `/api/admin/places/?${new URLSearchParams({ q })}`}
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
          <Select
            label="Colours show"
            value={w.overlay}
            options={EARTH_OVERLAYS.map((o) => ({ value: o, label: EARTH_OVERLAY_LABELS[o] }))}
            onChange={(v) => e((x) => void (x.overlay = v))}
          />
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
      return (
        <>
          <Text
            label="Entity"
            value={w.entityId}
            maxLength={255}
            placeholder="light.kitchen"
            list="ha-controls"
            onChange={(v) => e((x) => void (x.entityId = v.trim()))}
          />
          <HaEntityList id="ha-controls" />
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
          <Stepper label="Notes shown" value={w.count} min={1} max={20} onChange={(v) => e((x) => void (x.count = v))} />
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
            Plan meals in the Meals tab here, or at <span className="font-mono">/family/</span> from a phone.
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
          <p className="text-xs text-soft">
            The family adds items from their phones at <span className="font-mono">/family/</span> (Shopping tab here).
          </p>
        </>
      );
    }
    case "tasks": {
      const e = edit<"tasks">();
      const lists = config.integrations.tasks.lists.filter((l) => l.enabled);
      return (
        <>
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
    const r = await fetch(`/api/admin/transit/?${new URLSearchParams({ q: q.trim() })}`).catch(() => null);
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
