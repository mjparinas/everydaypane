"use client";

import { useState } from "react";

import type { Palette, Theme } from "@/lib/config/schema";

import { Colour, ConfirmButton, Range, Section, Select, Text, Toggle } from "./fields";
import { newId, useAdmin } from "./store";

// Colour schemes (Melvin, 2026-11-17: customizable colour schemes, day and night mode). Each scheme has a day palette
// and a night palette; the schedule says which one each part of the day uses.

const COLOURS: { key: keyof Palette; label: string }[] = [
  { key: "background", label: "Background" },
  { key: "backgroundTo", label: "Background (Gradient End)" },
  { key: "surface", label: "Widget Background" },
  { key: "text", label: "Text" },
  { key: "muted", label: "Quiet Text" },
  { key: "accent", label: "Accent" },
  { key: "danger", label: "Warnings" },
];

function Swatch({ theme, mode }: { theme: Theme; mode: "day" | "night" }) {
  const p = theme[mode];
  return (
    <div
      className="flex h-16 items-end gap-1 overflow-hidden rounded-xl p-2"
      style={{ background: `linear-gradient(135deg, ${p.background}, ${p.backgroundTo})` }}
      aria-hidden="true"
    >
      <div className="grid flex-1 rounded-md px-2 py-1 text-xs font-semibold" style={{ background: p.surface, color: p.text }}>
        <span>
          12:30 <span style={{ color: p.accent }}>●</span>
        </span>
        <span style={{ color: p.muted }}>{mode === "day" ? "Day" : "Night"}</span>
      </div>
    </div>
  );
}

export function ThemesPanel() {
  const config = useAdmin((s) => s.config);
  const edit = useAdmin((s) => s.edit);
  const [themeId, setThemeId] = useState(config.themeId);
  const [mode, setMode] = useState<"day" | "night">("day");
  const theme = config.themes.find((t) => t.id === themeId) ?? config.themes[0];
  if (!theme) return null;
  const ti = config.themes.indexOf(theme);
  const editTheme = (change: (t: Theme) => void) => edit((c) => change(c.themes[ti]!));
  const usedBy = config.views.filter((v) => v.themeId === theme.id).map((v) => v.name);

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="grid content-start gap-2">
        {config.themes.map((t) => (
          <button
            key={t.id}
            className={`card grid gap-2 p-3 text-left ${t.id === theme.id ? "border-brand ring-2 ring-brand/30" : ""}`}
            onClick={() => setThemeId(t.id)}
            aria-pressed={t.id === theme.id}
          >
            <span className="flex items-center justify-between font-semibold">
              {t.name}
              {t.id === config.themeId && <span className="rounded-full bg-brand px-2 text-xs text-brand-ink">Default</span>}
            </span>
            <div className="grid grid-cols-2 gap-1">
              <Swatch theme={t} mode="day" />
              <Swatch theme={t} mode="night" />
            </div>
          </button>
        ))}
        <button
          className="btn-ghost"
          disabled={config.themes.length >= 30}
          onClick={() => {
            const id = newId("theme");
            edit((c) => void c.themes.push({ ...structuredClone(theme), id, name: `${theme.name} copy`.slice(0, 40) }));
            setThemeId(id);
          }}
        >
          Copy This Scheme
        </button>
      </div>

      <div className="grid content-start gap-4">
        <Section title={theme.name}>
          <Text label="Name" value={theme.name} maxLength={40} onChange={(v) => editTheme((t) => void (t.name = v))} />
          <div className="flex flex-wrap gap-2">
            {theme.id !== config.themeId && (
              <button className="btn-primary" onClick={() => edit((c) => void (c.themeId = theme.id))}>
                Use on Every View
              </button>
            )}
            {theme.id !== config.themeId && config.themes.length > 1 && (
              <ConfirmButton
                label="Delete Scheme"
                onConfirm={() => {
                  edit((c) => {
                    c.themes = c.themes.filter((t) => t.id !== theme.id);
                    for (const v of c.views) if (v.themeId === theme.id) v.themeId = null;
                  });
                  setThemeId(config.themeId);
                }}
              />
            )}
          </div>
          {usedBy.length > 0 && <p className="text-xs text-soft">Used by: {usedBy.join(", ")}.</p>}
        </Section>

        <Section
          title="Colours"
          actions={
            <div className="flex gap-1" role="tablist" aria-label="Palette">
              {(["day", "night"] as const).map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  className={mode === m ? "btn-primary min-h-9" : "btn-ghost min-h-9"}
                  onClick={() => setMode(m)}
                >
                  {m === "day" ? "Day" : "Night"}
                </button>
              ))}
            </div>
          }
        >
          <Swatch theme={theme} mode={mode} />
          <div className="grid gap-3 sm:grid-cols-2">
            {COLOURS.map(({ key, label }) => (
              <Colour key={key} label={label} value={theme[mode][key]} onChange={(v) => editTheme((t) => void (t[mode][key] = v))} />
            ))}
          </div>
        </Section>

        <Section title="Look">
          <Select
            label="Font"
            value={theme.font}
            options={[
              { value: "inter", label: "Inter" },
              { value: "manrope", label: "Manrope" },
              { value: "space-grotesk", label: "Space Grotesk" },
              { value: "outfit", label: "Outfit" },
              { value: "dm-sans", label: "DM Sans" },
              { value: "literata", label: "Literata" },
              { value: "system", label: "The Display's Own Font" },
            ]}
            onChange={(v) => editTheme((t) => void (t.font = v))}
          />
          <Range
            label="Corner Rounding"
            value={theme.radius}
            min={0}
            max={40}
            step={1}
            format={(v) => `${v} px`}
            onChange={(v) => editTheme((t) => void (t.radius = v))}
          />
          <Range
            label="Widget Background"
            value={theme.surfaceOpacity}
            min={0}
            max={1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            hint="The default panel opacity. Each widget can override this in its own settings."
            onChange={(v) => editTheme((t) => void (t.surfaceOpacity = v))}
          />
          <Toggle
            label="Frosted Glass"
            checked={theme.glass}
            hint="Blurs the background behind widgets. It looks nice but makes a low-power wall panel work harder."
            onChange={(v) => editTheme((t) => void (t.glass = v))}
          />
        </Section>
      </div>
    </div>
  );
}
