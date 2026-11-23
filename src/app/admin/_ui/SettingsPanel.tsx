"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { BackupPanel } from "./BackupPanel";
import { CalendarLinksPanel } from "./CalendarLinksPanel";
import { ChoresPanel } from "./ChoresPanel";
import { CommutePanel, PlaceFinder } from "./CommutePanel";
import { NumberInput, Range, Section, Select, Stepper, Text, Toggle } from "./fields";
import { GarbagePanel } from "./GarbagePanel";
import { GooglePanel } from "./GooglePanel";
import { HomeAssistantPanel } from "./HomeAssistantPanel";
import { MusicPanel } from "./MusicPanel";
import { PhotosPanel } from "./PhotosPanel";
import { ScreenSaverPanel } from "./ScreenSaverPanel";
import { SportsPanel } from "./SportsPanel";
import { useAdmin } from "./store";
import { TasksPanel } from "./TasksPanel";
import { TIME_ZONES } from "./WidgetSettings";

// Settings is grouped with a sticky jump nav and #settings/<section> deep links so widgets can send people here
// without scrolling the whole page (Melvin, 2026-11-22 admin UX revamp).

const GROUPS = [
  { id: "home", label: "Home", sections: ["dashboard", "location"] },
  { id: "calendars", label: "Calendars", sections: ["google", "tasks", "icals"] },
  { id: "family", label: "Family", sections: ["garbage", "commute", "chores", "sports", "school"] },
  { id: "photos-music", label: "Photos & music", sections: ["photos", "music"] },
  { id: "ha", label: "Home tech", sections: ["ha"] },
  { id: "screen", label: "Screen", sections: ["screen-care", "screen-saver"] },
  { id: "alerts", label: "Alerts & backup", sections: ["alerts", "backup"] },
] as const;

type GroupId = (typeof GROUPS)[number]["id"];

const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

function settingsSectionFromHash(): string | null {
  const h = window.location.hash.slice(1);
  if (h === "settings") return "dashboard";
  if (!h.startsWith("settings/")) return null;
  return h.slice("settings/".length) || "dashboard";
}

function groupForSection(section: string | null): GroupId {
  if (!section) return "home";
  const g = GROUPS.find((x) => (x.sections as readonly string[]).includes(section));
  return g?.id ?? "home";
}

function goSettingsSection(section: string) {
  history.replaceState(null, "", `#settings/${section}`);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  document.getElementById(`settings-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function SettingsPanel() {
  const config = useAdmin((s) => s.config);
  const edit = useAdmin((s) => s.edit);
  const { location, burnIn, alerts } = config;
  const section = useSyncExternalStore(subscribeHash, settingsSectionFromHash, () => null);
  // Which group is open comes from the hash (deep links from widgets), not from effect-synced state.
  const openGroup = groupForSection(section);
  const [coordsOpen, setCoordsOpen] = useState(false);

  useEffect(() => {
    if (!section) return;
    // Wait a tick so the group's sections mount before scrolling.
    const t = window.setTimeout(() => {
      document.getElementById(`settings-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    return () => window.clearTimeout(t);
  }, [section]);

  function showGroup(id: GroupId) {
    return openGroup === id;
  }

  return (
    <div className="grid gap-4">
      <nav
        className="sticky top-[4.5rem] z-10 -mx-1 flex gap-2 overflow-x-auto bg-bg/95 px-1 py-2 backdrop-blur md:top-[6.5rem]"
        aria-label="Settings sections"
      >
        {GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            className={openGroup === g.id ? "btn-primary shrink-0" : "btn-ghost shrink-0"}
            aria-pressed={openGroup === g.id}
            onClick={() => goSettingsSection(g.sections[0]!)}
          >
            {g.label}
          </button>
        ))}
      </nav>

      {showGroup("home") && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section id="settings-dashboard" title="Dashboard">
            <Text label="Name" value={config.name} maxLength={60} onChange={(v) => edit((c) => void (c.name = v))} />
            <Select
              label="Units"
              value={config.units}
              options={[
                { value: "metric", label: "Metric (°C, km/h)" },
                { value: "imperial", label: "Imperial (°F, mph)" },
              ]}
              onChange={(v) => edit((c) => void (c.units = v))}
            />
            <Toggle label="12-hour clock" checked={config.hour12} onChange={(v) => edit((c) => void (c.hour12 = v))} />
          </Section>

          <Section id="settings-location" title="Location">
            <p className="text-xs text-soft">Weather, air quality and sunrise come from here. A neighbourhood-level spot is plenty.</p>
            <PlaceFinder
              label="Find a place"
              button="Find"
              placeholder="Town or neighbourhood, like Langley"
              nothing="Nothing matched. Try a town or neighbourhood name."
              url={(q) => `/api/admin/places/?${new URLSearchParams({ q })}`}
              onPick={(p) =>
                edit((c) => {
                  c.location.name = p.label.slice(0, 60);
                  c.location.latitude = p.latitude;
                  c.location.longitude = p.longitude;
                })
              }
            />
            <Text label="Place name" value={location.name} maxLength={60} onChange={(v) => edit((c) => void (c.location.name = v))} />
            <Select
              label="Time zone"
              value={location.timeZone}
              options={
                TIME_ZONES.some((z) => z.value === location.timeZone)
                  ? TIME_ZONES
                  : [{ value: location.timeZone, label: location.timeZone }, ...TIME_ZONES]
              }
              onChange={(v) => edit((c) => void (c.location.timeZone = v))}
            />
            <button
              type="button"
              className="btn-ghost justify-self-start"
              aria-expanded={coordsOpen}
              onClick={() => setCoordsOpen((o) => !o)}
            >
              {coordsOpen ? "Hide coordinates" : "Edit coordinates"}
            </button>
            {coordsOpen && (
              <div className="grid grid-cols-2 gap-3">
                <NumberInput
                  label="Latitude"
                  value={location.latitude}
                  min={-90}
                  max={90}
                  step={0.0001}
                  onChange={(v) => edit((c) => void (c.location.latitude = v))}
                />
                <NumberInput
                  label="Longitude"
                  value={location.longitude}
                  min={-180}
                  max={180}
                  step={0.0001}
                  onChange={(v) => edit((c) => void (c.location.longitude = v))}
                />
              </div>
            )}
          </Section>
        </div>
      )}

      {showGroup("calendars") && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div id="settings-google">
            <GooglePanel />
          </div>
          <div id="settings-tasks">
            <TasksPanel />
          </div>
          <div id="settings-icals" className="lg:col-span-2">
            <CalendarLinksPanel />
          </div>
        </div>
      )}

      {showGroup("family") && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div id="settings-garbage">
            <GarbagePanel />
          </div>
          <div id="settings-commute">
            <CommutePanel />
          </div>
          <div id="settings-chores" className="lg:col-span-2">
            <ChoresPanel />
          </div>
          <div id="settings-sports">
            <SportsPanel />
          </div>
          <Section id="settings-school" title="School status">
            <p className="text-xs text-soft">
              The school widget reads this page for a closure, delay or late start. With nothing like that on the page, it says open.
            </p>
            <Text
              label="District name"
              value={config.school.districtName}
              maxLength={80}
              onChange={(v) => edit((c) => void (c.school.districtName = v))}
            />
            <Text
              label="Status page"
              type="url"
              value={config.school.statusUrl}
              maxLength={300}
              hint="A public https page, such as the district site. Langley School District is the default."
              onChange={(v) => edit((c) => void (c.school.statusUrl = v))}
            />
          </Section>
        </div>
      )}

      {showGroup("photos-music") && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div id="settings-photos" className="lg:col-span-2">
            <PhotosPanel />
          </div>
          <div id="settings-music" className="lg:col-span-2">
            <MusicPanel />
          </div>
        </div>
      )}

      {showGroup("ha") && (
        <div id="settings-ha">
          <HomeAssistantPanel />
        </div>
      )}

      {showGroup("screen") && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section id="settings-screen-care" title="Screen care">
            <Toggle
              label="Burn-in protection"
              checked={burnIn.shift}
              hint="Moves the whole layout a few pixels now and then, so nothing sits on the same pixels for hours."
              onChange={(v) => edit((c) => void (c.burnIn.shift = v))}
            />
            {burnIn.shift && (
              <>
                <Range
                  label="Up to"
                  value={burnIn.maxPixels}
                  min={1}
                  max={24}
                  step={1}
                  format={(n) => `${n} px`}
                  onChange={(v) => edit((c) => void (c.burnIn.maxPixels = v))}
                />
                <Range
                  label="Every"
                  value={burnIn.minutes}
                  min={1}
                  max={60}
                  step={1}
                  format={(n) => `${n} min`}
                  onChange={(v) => edit((c) => void (c.burnIn.minutes = v))}
                />
              </>
            )}
            <p className="text-xs text-soft">Night dimming is set for each part of the day under Schedule.</p>
          </Section>
          <div id="settings-screen-saver">
            <ScreenSaverPanel />
          </div>
        </div>
      )}

      {showGroup("alerts") && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section id="settings-alerts" title="Emergency alerts">
            <Toggle label="Show alerts" checked={alerts.enabled} onChange={(v) => edit((c) => void (c.alerts.enabled = v))} />
            {alerts.enabled && (
              <>
                <Select
                  label="Red strip across the top for"
                  value={alerts.banner}
                  options={[
                    { value: "extreme", label: "Extreme alerts only" },
                    { value: "severe", label: "Severe and up" },
                    { value: "moderate", label: "Moderate and up" },
                    { value: "minor", label: "Every alert" },
                    { value: "never", label: "Never (alerts widget only)" },
                  ]}
                  hint="Anyone can tap the strip to dismiss it."
                  onChange={(v) => edit((c) => void (c.alerts.banner = v))}
                />
                <Toggle
                  label="Alert Ready (public emergencies)"
                  checked={alerts.sources.alertReady}
                  onChange={(v) => edit((c) => void (c.alerts.sources.alertReady = v))}
                />
                <Toggle
                  label="Environment Canada weather warnings"
                  checked={alerts.sources.weather}
                  onChange={(v) => edit((c) => void (c.alerts.sources.weather = v))}
                />
                <Toggle
                  label="DriveBC road events"
                  checked={alerts.sources.roads}
                  onChange={(v) => edit((c) => void (c.alerts.sources.roads = v))}
                />
                <Toggle
                  label="Earthquakes"
                  checked={alerts.sources.earthquakes}
                  onChange={(v) => edit((c) => void (c.alerts.sources.earthquakes = v))}
                />
                <Toggle
                  label="BC Hydro power outages"
                  checked={alerts.sources.power}
                  onChange={(v) => edit((c) => void (c.alerts.sources.power = v))}
                />
                <Toggle
                  label="Email admins and family for new red-strip alerts"
                  checked={alerts.notifyEmail}
                  onChange={(v) => edit((c) => void (c.alerts.notifyEmail = v))}
                  hint="Each alert is emailed once to everyone on ADMIN_EMAILS and FAMILY_EMAILS."
                />
                <Range
                  label="Within"
                  value={alerts.radiusKm}
                  min={10}
                  max={500}
                  step={10}
                  format={(n) => `${n} km`}
                  onChange={(v) => edit((c) => void (c.alerts.radiusKm = v))}
                />
                <Range
                  label="Earthquakes from magnitude"
                  value={alerts.minMagnitude}
                  min={2}
                  max={9}
                  step={0.1}
                  format={(n) => n.toFixed(1)}
                  onChange={(v) => edit((c) => void (c.alerts.minMagnitude = v))}
                />
                <Range
                  label="Power outages within"
                  value={alerts.powerKm}
                  min={0}
                  max={50}
                  step={1}
                  format={(n) => `${n} km`}
                  onChange={(v) => edit((c) => void (c.alerts.powerKm = v))}
                />
                <p className="text-xs text-soft">
                  Alert Ready and weather warnings count when they cover your location; road events and earthquakes count within the
                  distance above. A power outage covering your home reaches the red strip at Severe; ones nearby count within their own
                  distance.
                </p>
              </>
            )}
          </Section>
          <div id="settings-backup">
            <BackupPanel />
          </div>
        </div>
      )}
    </div>
  );
}

// Re-export so callers that only need steppers from this file keep a single import path unused; silence lint if unused.
void Stepper;
