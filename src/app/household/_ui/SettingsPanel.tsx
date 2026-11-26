"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { isHouseholdSettingsGroup } from "@/lib/plans";

import { BackupPanel } from "./BackupPanel";
import { CalendarLinksPanel } from "./CalendarLinksPanel";
import { ChoresPanel } from "./ChoresPanel";
import { CommutePanel, PlaceFinder } from "./CommutePanel";
import { ContentPanel } from "./ContentPanel";
import { EcoFlowPanel } from "./EcoFlowPanel";
import { NumberInput, Range, Section, Select, Stepper, Text, Toggle } from "./fields";
import { GarbagePanel } from "./GarbagePanel";
import { GooglePanel } from "./GooglePanel";
import { HomeAssistantPanel } from "./HomeAssistantPanel";
import { MicrosoftPanel } from "./MicrosoftPanel";
import { MusicPanel } from "./MusicPanel";
import { PhotosPanel } from "./PhotosPanel";
import { HouseholdBadge, HouseholdSoftLock, PlanSettingsCard, usePlan } from "./plan";
import { ReportProblem } from "./ReportProblem";
import { ScreenSaverPanel } from "./ScreenSaverPanel";
import { SmartHomePanel } from "./SmartHomePanel";
import { SportsPanel } from "./SportsPanel";
import { useAdmin } from "./store";
import { AllTasksPanels } from "./TasksPanel";
import { UnifiPanel } from "./UnifiPanel";
import { TIME_ZONES } from "./WidgetSettings";

// Settings is grouped with a sticky jump nav and #settings/<section> deep links so widgets can send people here
// without scrolling the whole page (Melvin, 2026-11-22 admin UX revamp). Free users see Household badges and soft
// locks on paid groups (Melvin, 2026-11-23).

// Jump nav tiers (H1, 2026-11-24; distilled 2026-11-24 critique): Home → Everyday (≤4) → Advanced.
const GROUPS = [
  { id: "home", label: "Home", tier: "Home", sections: ["dashboard", "location", "plan"] },
  {
    id: "calendars",
    label: "Calendars & tasks",
    tier: "Everyday",
    sections: ["google", "microsoft", "icals", "tasks"],
  },
  { id: "family", label: "Family tools", tier: "Everyday", sections: ["garbage", "commute", "chores", "sports", "school"] },
  { id: "photos-music", label: "Photos & music", tier: "Everyday", sections: ["photos", "music"] },
  {
    id: "screen",
    label: "Screen & alerts",
    tier: "Everyday",
    sections: ["screen-care", "screen-saver", "alerts", "backup"],
  },
  {
    id: "content",
    label: "Content & finance",
    tier: "Advanced",
    sections: ["content", "ynab", "fitbit", "oura", "gmail-unread", "slack", "trello"],
  },
  {
    id: "ha",
    label: "Home & devices",
    tier: "Advanced",
    sections: ["ha", "smart-home", "unifi", "ecoflow", "weather-stations", "indoor-air", "sprinklers", "pool", "laundry", "menus"],
  },
] as const;

type GroupId = (typeof GROUPS)[number]["id"];
const TIERS = ["Home", "Everyday", "Advanced"] as const;

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

// Scroll a section card to just below the sticky header and Settings navigation, whose height changes with
// the window width (three rows of chips), so a fixed scroll-margin would land the card under it.
function scrollToSection(section: string) {
  const el = document.getElementById(`settings-${section}`);
  if (!el) return;
  const nav = document.querySelector('nav[aria-label="Settings sections"]');
  const offset = (nav?.getBoundingClientRect().height ?? 0) + (document.querySelector("header")?.getBoundingClientRect().height ?? 0) + 16;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: "smooth" });
}

function goSettingsSection(section: string) {
  history.replaceState(null, "", `#settings/${section}`);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  if (section === "dashboard") {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  scrollToSection(section);
}

export function SettingsPanel() {
  const config = useAdmin((s) => s.config);
  const edit = useAdmin((s) => s.edit);
  const { isPaid, openUpgrade } = usePlan();
  const { location, burnIn, alerts } = config;
  const section = useSyncExternalStore(subscribeHash, settingsSectionFromHash, () => null);
  // Which group is open comes from the hash (deep links from widgets), not from effect-synced state.
  const openGroup = groupForSection(section);
  const [coordsOpen, setCoordsOpen] = useState(false);

  useEffect(() => {
    if (!section) return;
    // The Home section should open directly below the Settings navigation. Only deep
    // section links should scroll a card into the sticky navigation area.
    if (section === "dashboard") return;
    // Wait a tick so the group's sections mount before scrolling.
    const t = window.setTimeout(() => {
      scrollToSection(section);
    }, 50);
    return () => window.clearTimeout(t);
  }, [section]);

  function showGroup(id: GroupId) {
    return openGroup === id;
  }

  return (
    // overflow-x-clip, not hidden: hidden makes this div a scroll container, so the sticky nav below pinned itself
    // 6.5rem down inside it, leaving a band under the header and covering the cards (Melvin, 2026-11-25).
    <div className="grid min-w-0 max-w-full gap-4 overflow-x-clip">
      <nav
        className="sticky top-[3.75rem] z-10 flex min-w-0 max-w-full flex-col gap-2 bg-bg/95 py-2 backdrop-blur md:top-[6rem]"
        aria-label="Settings sections"
      >
        {TIERS.map((tier) => (
          <div key={tier} className="flex w-full min-w-0 max-w-full items-center gap-2 overflow-x-auto overscroll-x-contain">
            <span className="shrink-0 text-xs font-bold tracking-wide text-soft uppercase">{tier}</span>
            {GROUPS.filter((g) => g.tier === tier).map((g) => {
              const locked = !isPaid && isHouseholdSettingsGroup(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  className={`${openGroup === g.id ? "btn-primary shrink-0" : "btn-ghost shrink-0"} ${locked ? "opacity-70" : ""}`}
                  aria-pressed={openGroup === g.id}
                  onClick={() => goSettingsSection(g.sections[0]!)}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {g.label}
                    {locked ? <HouseholdBadge /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {showGroup("home") && (
        <div className="grid gap-4 lg:grid-cols-2">
          <PlanSettingsCard />
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
              url={(q) => `/api/household/places/?${new URLSearchParams({ q })}`}
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
              label="Weather forecast"
              value={config.weather?.provider ?? "openMeteo"}
              options={[
                { value: "openMeteo", label: "Open-Meteo (default)" },
                { value: "environmentCanada", label: "Environment Canada" },
              ]}
              onChange={(v) => edit((c) => void (c.weather.provider = v))}
            />
            <p className="text-xs text-soft">
              Environment Canada uses the nearest official city page (best for Canada). Open-Meteo still supplies UV, pollen and air
              quality. Outside Canada, Everydaypane falls back to Open-Meteo.
            </p>
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
          {!isPaid && (
            <p className="text-sm text-soft lg:col-span-2">
              Free includes 2 calendars across Google, Microsoft and iCal.{" "}
              <button
                type="button"
                className="font-semibold text-brand underline-offset-2 hover:underline"
                onClick={() => openUpgrade("calendar")}
              >
                Need more?
              </button>
            </p>
          )}
          <div id="settings-google">
            <GooglePanel />
          </div>
          <div id="settings-microsoft">
            <MicrosoftPanel />
          </div>
          <div id="settings-icals" className="lg:col-span-2">
            <HouseholdSoftLock reason="icals" label="iCal links need Household">
              <CalendarLinksPanel />
            </HouseholdSoftLock>
          </div>
          <div id="settings-tasks" className="lg:col-span-2">
            <HouseholdSoftLock reason="tasks" label="Tasks need Household">
              <AllTasksPanels />
            </HouseholdSoftLock>
          </div>
        </div>
      )}

      {showGroup("family") && (
        <HouseholdSoftLock reason="family" label="Family tools need Household">
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
        </HouseholdSoftLock>
      )}

      {showGroup("photos-music") && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div id="settings-photos" className="lg:col-span-2">
            <PhotosPanel />
          </div>
          <div id="settings-music" className="lg:col-span-2">
            <HouseholdSoftLock reason="music" label="Music needs Household">
              <MusicPanel />
            </HouseholdSoftLock>
          </div>
        </div>
      )}

      {showGroup("content") && (
        <div id="settings-content">
          <HouseholdSoftLock reason="content" label="Content & finance need Household">
            <ContentPanel />
          </HouseholdSoftLock>
        </div>
      )}

      {showGroup("ha") && (
        <HouseholdSoftLock reason="ha" label="Smart home needs Household">
          <div className="grid gap-4">
            <div id="settings-ha">
              <HomeAssistantPanel />
            </div>
            <SmartHomePanel />
            <EcoFlowPanel />
            <UnifiPanel />
          </div>
        </HouseholdSoftLock>
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
            <HouseholdSoftLock reason="screenSaver" label="Screen saver needs Household">
              <ScreenSaverPanel />
            </HouseholdSoftLock>
          </div>
          <div className="lg:col-span-2">
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
                  <details className="rounded-xl border border-line bg-bg px-3 py-2">
                    <summary className="cursor-pointer text-sm font-semibold text-ink">Alert sources</summary>
                    <div className="mt-3 grid gap-3">
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
                        label="Evacuation orders and alerts (EmergencyInfoBC)"
                        checked={alerts.sources.evacuations}
                        onChange={(v) => edit((c) => void (c.alerts.sources.evacuations = v))}
                      />
                    </div>
                  </details>
                  {isPaid ? (
                    <Toggle
                      label="Email admins and family for new red-strip alerts"
                      checked={alerts.notifyEmail}
                      onChange={(v) => edit((c) => void (c.alerts.notifyEmail = v))}
                      hint="Each alert is emailed once to household admins and family addresses."
                    />
                  ) : (
                    <button
                      type="button"
                      className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3 text-left opacity-70"
                      onClick={() => openUpgrade("alertEmail")}
                    >
                      <span className="text-sm font-medium">Email admins and family for new red-strip alerts</span>
                      <HouseholdBadge />
                    </button>
                  )}
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
                  <Range
                    label="Evacuation orders within"
                    value={alerts.evacuationKm}
                    min={0}
                    max={100}
                    step={1}
                    format={(n) => `${n} km`}
                    onChange={(v) => edit((c) => void (c.alerts.evacuationKm = v))}
                  />
                  <p className="text-xs text-soft">
                    Alert Ready and weather warnings count when they cover your location; road events and earthquakes count within the
                    distance above. A power outage covering your home reaches the red strip at Severe; ones nearby count within their own
                    distance. An evacuation order covering your home is Extreme (an alert is Severe); ones nearby count within their own
                    distance.
                  </p>
                </>
              )}
            </Section>
          </div>
          <div id="settings-backup">
            <HouseholdSoftLock reason="backup" label="Backup needs Household">
              <BackupPanel />
            </HouseholdSoftLock>
          </div>
          <div id="settings-report" className="lg:col-span-2">
            <ReportProblem />
          </div>
        </div>
      )}
    </div>
  );
}

// Re-export so callers that only need steppers from this file keep a single import path unused; silence lint if unused.
void Stepper;
