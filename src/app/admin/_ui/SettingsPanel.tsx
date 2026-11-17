"use client";

import { NumberInput, Section, Select, Text, Toggle } from "./fields";
import { GarbagePanel } from "./GarbagePanel";
import { GooglePanel } from "./GooglePanel";
import { HomeAssistantPanel } from "./HomeAssistantPanel";
import { PhotosPanel } from "./PhotosPanel";
import { useAdmin } from "./store";
import { TIME_ZONES } from "./WidgetSettings";

export function SettingsPanel() {
  const config = useAdmin((s) => s.config);
  const edit = useAdmin((s) => s.edit);
  const { location, burnIn, alerts } = config;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Dashboard">
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

      <Section title="Location">
        <p className="text-xs text-soft">Weather, air quality and sunrise come from here. A neighbourhood-level spot is plenty.</p>
        <Text label="Place name" value={location.name} maxLength={60} onChange={(v) => edit((c) => void (c.location.name = v))} />
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
      </Section>

      <GooglePanel />
      <GarbagePanel />
      <PhotosPanel />
      <HomeAssistantPanel />

      <Section title="Screen care">
        <Toggle
          label="Burn-in protection"
          checked={burnIn.shift}
          hint="Moves the whole layout a few pixels now and then, so nothing sits on the same pixels for hours."
          onChange={(v) => edit((c) => void (c.burnIn.shift = v))}
        />
        {burnIn.shift && (
          <div className="grid grid-cols-2 gap-3">
            <NumberInput
              label="Up to (px)"
              value={burnIn.maxPixels}
              min={1}
              max={24}
              onChange={(v) => edit((c) => void (c.burnIn.maxPixels = v))}
            />
            <NumberInput
              label="Every (minutes)"
              value={burnIn.minutes}
              min={1}
              max={60}
              onChange={(v) => edit((c) => void (c.burnIn.minutes = v))}
            />
          </div>
        )}
        <p className="text-xs text-soft">Night dimming is set for each part of the day under Schedule.</p>
      </Section>

      <Section title="Emergency alerts">
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
            <div className="grid grid-cols-2 gap-3">
              <NumberInput
                label="Within (km)"
                value={alerts.radiusKm}
                min={10}
                max={500}
                onChange={(v) => edit((c) => void (c.alerts.radiusKm = v))}
              />
              <NumberInput
                label="Earthquakes from magnitude"
                value={alerts.minMagnitude}
                min={2}
                max={9}
                step={0.1}
                onChange={(v) => edit((c) => void (c.alerts.minMagnitude = v))}
              />
            </div>
            <p className="text-xs text-soft">
              Alert Ready and weather warnings count when they cover your location; road events and earthquakes count within the distance
              above.
            </p>
          </>
        )}
      </Section>
    </div>
  );
}
