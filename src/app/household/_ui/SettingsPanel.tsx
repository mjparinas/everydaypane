"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import type { DashboardConfig } from "@/lib/config/schema";
import { WIDGETS } from "@/lib/config/widgets";
import { featureFlag } from "@/lib/featureFlags";
import { isHouseholdSettingsGroup } from "@/lib/plans";
import { alertSourceLabels, REGION_IDS, regionAt, regionOf, REGIONS, type RegionId } from "@/lib/regions";
import { TRANSIT_AGENCIES } from "@/lib/transitAgencies";

import { BackupPanel } from "./BackupPanel";
import { CalendarLinksPanel } from "./CalendarLinksPanel";
import { ChoresPanel } from "./ChoresPanel";
import { CommutePanel, PlaceFinder } from "./CommutePanel";
import { ContentPanel } from "./ContentPanel";
import { EcoFlowPanel } from "./EcoFlowPanel";
import { NumberInput, Range, Section, Select, Stepper, Text, Toggle } from "./fields";
import { Flagged, FlaggedSettings } from "./flags";
import { GarbagePanel } from "./GarbagePanel";
import { GooglePanel } from "./GooglePanel";
import { HomeAssistantPanel } from "./HomeAssistantPanel";
import { MicrosoftPanel } from "./MicrosoftPanel";
import { MusicPanel } from "./MusicPanel";
import { PackagesSection } from "./packages";
import { PhotosPanel } from "./PhotosPanel";
import { HouseholdBadge, HouseholdSoftLock, PlanSettingsCard, usePlan } from "./plan";
import { ReportProblem } from "./ReportProblem";
import { SchoolDaysPanel } from "./SchoolDaysPanel";
import { ScreenSaverPanel, ScreenSaverSummary } from "./ScreenSaverPanel";
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
    label: "Calendars & Tasks",
    tier: "Everyday",
    sections: ["google", "microsoft", "icals", "tasks"],
  },
  {
    id: "family",
    label: "Family Tools",
    tier: "Everyday",
    sections: ["garbage", "commute", "chores", "sports", "packages", "school", "school-days"],
  },
  { id: "photos-music", label: "Photos & Music", tier: "Everyday", sections: ["photos", "music"] },
  {
    id: "screen",
    // Screen saver leads this group and its chip (Melvin, 2026-11-26: "needs to be more prominent in the settings").
    label: "Screen Saver & Alerts",
    tier: "Everyday",
    sections: ["screen-saver", "message-popups", "screen-care", "alerts", "backup"],
  },
  {
    id: "content",
    label: "Content & Finance",
    tier: "Advanced",
    sections: ["content", "ynab", "fitbit", "oura", "gmail-unread", "slack", "trello"],
  },
  {
    id: "ha",
    label: "Home & Devices",
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
  const rules = alerts.rules;
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
          <ScreenSaverSummary onOpen={() => goSettingsSection("screen-saver")} />
          <Section id="settings-dashboard" title="Dashboard">
            <Text label="Name" value={config.name} maxLength={60} onChange={(v) => edit((c) => void (c.name = v))} />
            <Select
              label="Units"
              value={config.units}
              options={[
                { value: "metric", label: "Metric (°C, km/h)" },
                { value: "imperial", label: "Imperial (°F, Mph)" },
              ]}
              onChange={(v) => edit((c) => void (c.units = v))}
            />
            <Toggle label="12-Hour Clock" checked={config.hour12} onChange={(v) => edit((c) => void (c.hour12 = v))} />
          </Section>

          <Section id="settings-location" title="Location">
            <p className="text-xs text-soft">Weather, air quality and sunrise come from here. A neighbourhood-level spot is plenty.</p>
            <PlaceFinder
              label="Find a Place"
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
            <Text label="Place Name" value={location.name} maxLength={60} onChange={(v) => edit((c) => void (c.location.name = v))} />
            <Select
              label="Weather Forecast"
              value={config.weather?.provider ?? "openMeteo"}
              options={[
                { value: "openMeteo", label: "Open-Meteo (Default)" },
                { value: "environmentCanada", label: "Environment Canada" },
              ]}
              onChange={(v) => edit((c) => void (c.weather.provider = v))}
            />
            <p className="text-xs text-soft">
              Environment Canada uses the nearest official city page (best for Canada). Open-Meteo still supplies UV, pollen and air
              quality. Outside Canada, Everydaypane falls back to Open-Meteo.
            </p>
            <Select
              label="Time Zone"
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
              {coordsOpen ? "Hide Coordinates" : "Edit Coordinates"}
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
            <Flagged name={featureFlag("regionalPacks")}>
              <RegionPicker config={config} onChange={(v) => edit((c) => void (c.region = v))} />
            </Flagged>
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
                Need More?
              </button>
            </p>
          )}
          <div id="settings-google">
            <GooglePanel />
          </div>
          <div id="settings-microsoft">
            <MicrosoftPanel />
          </div>
          <div className="lg:col-span-2">
            <Section id="settings-calendar-titles" title="Event Titles">
              <Toggle
                label="Title Case"
                hint="Shows “dentist with sam” as “Dentist with Sam” on the wall. Acronyms like BC and PRO-D stay as typed, and your calendars aren't changed."
                checked={config.calendarTitleCase}
                onChange={(v) => edit((c) => void (c.calendarTitleCase = v))}
              />
            </Section>
          </div>
          <div id="settings-icals" className="lg:col-span-2">
            <HouseholdSoftLock reason="icals" label="iCal links need Household">
              <CalendarLinksPanel />
            </HouseholdSoftLock>
          </div>
          <FlaggedSettings section="tasks">
            <div id="settings-tasks" className="lg:col-span-2">
              <HouseholdSoftLock reason="tasks" label="Tasks Need Household">
                <AllTasksPanels />
              </HouseholdSoftLock>
            </div>
          </FlaggedSettings>
        </div>
      )}

      {showGroup("family") && (
        <HouseholdSoftLock reason="family" label="Family Tools Need Household">
          <div className="grid gap-4 lg:grid-cols-2">
            <FlaggedSettings section="garbage">
              <div id="settings-garbage">
                <GarbagePanel />
              </div>
            </FlaggedSettings>
            <FlaggedSettings section="commute">
              <div id="settings-commute">
                <CommutePanel />
              </div>
            </FlaggedSettings>
            <FlaggedSettings section="chores">
              <div id="settings-chores" className="lg:col-span-2">
                <ChoresPanel />
              </div>
            </FlaggedSettings>
            <FlaggedSettings section="sports">
              <div id="settings-sports">
                <SportsPanel />
              </div>
            </FlaggedSettings>
            <FlaggedSettings section="packages">
              <PackagesSection />
            </FlaggedSettings>
            <Section id="settings-school" title="School Status">
              <p className="text-xs text-soft">
                The school widget reads this page for a closure, delay or late start. With nothing like that on the page, it says open.
              </p>
              <Text
                label="District Name"
                value={config.school.districtName}
                maxLength={80}
                onChange={(v) => edit((c) => void (c.school.districtName = v))}
              />
              <Text
                label="Status Page"
                type="url"
                value={config.school.statusUrl}
                maxLength={300}
                hint="A public https page, such as the district site. Langley School District is the default."
                onChange={(v) => edit((c) => void (c.school.statusUrl = v))}
              />
            </Section>
            <SchoolDaysPanel />
          </div>
        </HouseholdSoftLock>
      )}

      {showGroup("photos-music") && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div id="settings-photos" className="lg:col-span-2">
            <PhotosPanel />
          </div>
          <FlaggedSettings section="music">
            <div id="settings-music" className="lg:col-span-2">
              <HouseholdSoftLock reason="music" label="Music Needs Household">
                <MusicPanel />
              </HouseholdSoftLock>
            </div>
          </FlaggedSettings>
        </div>
      )}

      {showGroup("content") && (
        <div id="settings-content">
          <HouseholdSoftLock reason="content" label="Content & Finance Need Household">
            <ContentPanel />
          </HouseholdSoftLock>
        </div>
      )}

      {showGroup("ha") && (
        <HouseholdSoftLock reason="ha" label="Smart Home Needs Household">
          <div className="grid gap-4">
            <FlaggedSettings section="ha">
              <div id="settings-ha">
                <HomeAssistantPanel />
              </div>
            </FlaggedSettings>
            <SmartHomePanel />
            <EcoFlowPanel />
            <UnifiPanel />
          </div>
        </HouseholdSoftLock>
      )}

      {showGroup("screen") && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div id="settings-screen-saver">
            <HouseholdSoftLock reason="screenSaver" label="Screen Saver Needs Household">
              <ScreenSaverPanel />
            </HouseholdSoftLock>
          </div>
          <FlaggedSettings section="message-popups">
            <HouseholdSoftLock reason="messagePopups" label="Message Pop-Ups Need Household">
              <Section id="settings-message-popups" title="Message Pop-Ups">
                <Toggle
                  label="Pop Up New Notes on the Wall"
                  checked={config.messagePopups.enabled}
                  hint="A note posted to the message board shows in the bottom-right corner of every display, in the colour its sender picked, until someone taps Dismiss. Each screen keeps its own. The note stays on the board."
                  onChange={(v) => edit((c) => void (c.messagePopups.enabled = v))}
                />
              </Section>
            </HouseholdSoftLock>
          </FlaggedSettings>
          <Section id="settings-screen-care" title="Screen Care">
            <Toggle
              label="Burn-In Protection"
              checked={burnIn.shift}
              hint="Moves the whole layout a few pixels now and then, so nothing sits on the same pixels for hours."
              onChange={(v) => edit((c) => void (c.burnIn.shift = v))}
            />
            {burnIn.shift && (
              <>
                <Range
                  label="Up To"
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
          <div className="lg:col-span-2">
            <Section id="settings-alerts" title="Emergency Alerts">
              <Toggle label="Show Alerts" checked={alerts.enabled} onChange={(v) => edit((c) => void (c.alerts.enabled = v))} />
              {alerts.enabled && (
                <>
                  <Select
                    label="Red Strip Across the Top For"
                    value={alerts.banner}
                    options={[
                      { value: "extreme", label: "Extreme Alerts Only" },
                      { value: "severe", label: "Severe and Up" },
                      { value: "moderate", label: "Moderate and Up" },
                      { value: "minor", label: "Every Alert" },
                      { value: "never", label: "Never (Alerts Widget Only)" },
                    ]}
                    hint="Anyone can tap the strip to dismiss it."
                    onChange={(v) => edit((c) => void (c.alerts.banner = v))}
                  />
                  <details className="rounded-xl border border-line bg-bg px-3 py-2">
                    <summary className="cursor-pointer text-sm font-semibold text-ink">Alert Sources</summary>
                    <div className="mt-3 grid gap-3">
                      {/* Regional packs (2026-11-26): only the sources that cover this household's region, named for it. */}
                      {(Object.entries(alertSourceLabels(regionOf(config))) as [keyof typeof alerts.sources, string | null][]).map(
                        ([key, label]) =>
                          label && (
                            <Toggle
                              key={key}
                              label={label}
                              checked={alerts.sources[key]}
                              onChange={(v) => edit((c) => void (c.alerts.sources[key] = v))}
                            />
                          ),
                      )}
                      <p className="text-xs text-soft">
                        Sources for {regionOf(config).name}. Change the region under{" "}
                        <a className="underline" href="#settings/location">
                          Location
                        </a>
                        .
                      </p>
                    </div>
                  </details>
                  <Flagged name={featureFlag("smartNotices")}>
                    <details className="rounded-xl border border-line bg-bg px-3 py-2" id="settings-smart-notices">
                      <summary className="cursor-pointer text-sm font-semibold text-ink">Smart Notices</summary>
                      <div className="mt-3 grid gap-3">
                        <p className="text-xs text-soft">
                          Blue notes on the strip that put two things together, like the sprinklers and the forecast. Each needs the
                          integrations it names; they are never emailed.
                        </p>
                        <Toggle
                          label="Sprinklers Due in Frost"
                          checked={rules.sprinklerFrost}
                          onChange={(v) => edit((c) => void (c.alerts.rules.sprinklerFrost = v))}
                          hint="Rachio + the forecast: a watering in the next day when it will be near freezing."
                        />
                        <Toggle
                          label="Sprinklers Due When Rain Is Likely"
                          checked={rules.sprinklerRain}
                          onChange={(v) => edit((c) => void (c.alerts.rules.sprinklerRain = v))}
                          hint="Rachio + the forecast: 70% chance of rain or more within three hours of a watering."
                        />
                        <Toggle
                          label="Backup Battery During a Power Outage"
                          checked={rules.outageBattery}
                          onChange={(v) => edit((c) => void (c.alerts.rules.outageBattery = v))}
                          hint="BC Hydro + EcoFlow: when an outage covers your home, how much each power station has left."
                        />
                        <Toggle
                          label="Poor Air Outside"
                          checked={rules.smokyAir}
                          onChange={(v) => edit((c) => void (c.alerts.rules.smokyAir = v))}
                          hint="Air quality, plus indoor PM2.5 from Airthings when you have it: keep the windows shut."
                        />
                        {rules.smokyAir && (
                          <Range
                            label="From AQHI"
                            value={rules.smokyAqhi}
                            min={4}
                            max={10}
                            step={1}
                            format={(n) => String(n)}
                            onChange={(v) => edit((c) => void (c.alerts.rules.smokyAqhi = v))}
                          />
                        )}
                        <Toggle
                          label="Pool Freeze Warning"
                          checked={rules.poolFreeze}
                          onChange={(v) => edit((c) => void (c.alerts.rules.poolFreeze = v))}
                          hint="Blue Riiot + the forecast: a hard freeze in the next day while the pool is still reporting."
                        />
                        <Toggle
                          label="Laundry Left in the Machine"
                          checked={rules.laundryWaiting}
                          onChange={(v) => edit((c) => void (c.alerts.rules.laundryWaiting = v))}
                          hint="Laundry: a reminder once a finished load has sat a while, even after the done note is dismissed."
                        />
                        {rules.laundryWaiting && (
                          <Range
                            label="After"
                            value={rules.laundryWaitMinutes}
                            min={15}
                            max={240}
                            step={15}
                            format={(n) => `${n} min`}
                            onChange={(v) => edit((c) => void (c.alerts.rules.laundryWaitMinutes = v))}
                          />
                        )}
                        <Toggle
                          label="Bins Out the Night Before"
                          checked={rules.garbageEve}
                          onChange={(v) => edit((c) => void (c.alerts.rules.garbageEve = v))}
                          hint="Garbage day: which carts go out, the evening before pickup."
                        />
                        {rules.garbageEve && (
                          <Range
                            label="From"
                            value={rules.garbageHour}
                            min={12}
                            max={22}
                            step={1}
                            format={(n) => `${n % 12 || 12} ${n < 12 ? "AM" : "PM"}`}
                            onChange={(v) => edit((c) => void (c.alerts.rules.garbageHour = v))}
                          />
                        )}
                      </div>
                    </details>
                  </Flagged>
                  {isPaid ? (
                    <Toggle
                      label="Email Admins and Family for New Red-Strip Alerts"
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
                    label="Earthquakes from Magnitude"
                    value={alerts.minMagnitude}
                    min={2}
                    max={9}
                    step={0.1}
                    format={(n) => n.toFixed(1)}
                    onChange={(v) => edit((c) => void (c.alerts.minMagnitude = v))}
                  />
                  <Range
                    label="Power Outages Within"
                    value={alerts.powerKm}
                    min={0}
                    max={50}
                    step={1}
                    format={(n) => `${n} km`}
                    onChange={(v) => edit((c) => void (c.alerts.powerKm = v))}
                  />
                  <Range
                    label="Evacuation Orders Within"
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
            <HouseholdSoftLock reason="backup" label="Backup Needs Household">
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

/**
 * Regional packs (Melvin, 2026-11-26): which local sources this household's location gets, worked out from the
 * coordinates (src/lib/regions.ts), with a by-hand choice for a home right on a border.
 */
function RegionPicker({ config, onChange }: { config: DashboardConfig; onChange: (v: RegionId | "auto") => void }) {
  const auto = REGIONS[regionAt(config.location.latitude, config.location.longitude)];
  const region = regionOf(config);
  const labels = alertSourceLabels(region);
  const alerts = [labels.alertReady, labels.weather, labels.earthquakes].filter(Boolean).join(", ");
  const local = [
    labels.power,
    labels.roads,
    labels.evacuations,
    ...region.transit.map((a) => `${TRANSIT_AGENCIES[a].name} departures`),
    ...region.localWidgets.map((t) => WIDGETS[t as keyof typeof WIDGETS]?.label).filter(Boolean),
  ].filter(Boolean);
  return (
    <div className="grid gap-2 rounded-xl border border-line bg-bg px-3 py-3">
      <Select
        label="Region"
        value={config.region ?? "auto"}
        options={[
          { value: "auto", label: `From the location (${auto.name})` },
          ...REGION_IDS.map((id) => ({ value: id, label: REGIONS[id].name })),
        ]}
        hint="Picks the local alerts, power outages and transit that apply. Pick one by hand if you live right on a border."
        onChange={onChange}
      />
      <p className="text-xs text-soft">
        <span className="font-semibold text-ink">Alerts:</span> {alerts || "none for this region yet"}.
      </p>
      <p className="text-xs text-soft">
        <span className="font-semibold text-ink">Local to {region.name}:</span>{" "}
        {local.length ? local.join(", ") : "nothing extra yet. Weather, radar, calendars and everything else still work."}
      </p>
    </div>
  );
}
