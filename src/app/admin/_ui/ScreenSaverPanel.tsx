"use client";

import { Range, Section, Select, Text, Toggle } from "./fields";
import { HaEntityList } from "./haEntities";
import { useAdmin } from "./store";
import { TimePicker } from "./TimePicker";

const MAX_MOTION = 5;

// Settings › Screen saver (Melvin, 2026-11-21): photos only or dark after some idle minutes, dark at night, and Home
// Assistant motion sensors that wake the screen. The display side is src/display/saver.ts.
export function ScreenSaverPanel() {
  const s = useAdmin((st) => st.config.screenSaver);
  const hour12 = useAdmin((st) => st.config.hour12);
  const sources = useAdmin((st) => st.config.integrations.photos.sources);
  const haUrl = useAdmin((st) => st.config.integrations.homeAssistant.url);
  const edit = useAdmin((st) => st.edit);
  const motion = s.motionEntityIds.length < MAX_MOTION ? [...s.motionEntityIds, ""] : s.motionEntityIds;

  return (
    <Section title="Screen saver">
      <Toggle
        label="When nobody's using it"
        checked={s.idle}
        hint="After a while with no touch, the screen shows only photos or goes dark. A tap brings the dashboard back."
        onChange={(v) => edit((c) => void (c.screenSaver.idle = v))}
      />
      {s.idle && (
        <Select
          label="Show"
          value={s.shows}
          options={[
            { value: "photos", label: "Photos, full screen" },
            { value: "dark", label: "Nothing (dark screen)" },
          ]}
          onChange={(v) => edit((c) => void (c.screenSaver.shows = v))}
        />
      )}
      {s.idle && s.shows === "photos" && (
        <>
          {sources.length ? (
            <>
              <p className="text-xs text-soft">Pick the albums to show. With none picked, it shows them all.</p>
              {sources.map((p) => (
                <Toggle
                  key={p.id}
                  label={p.name || "Album"}
                  checked={s.photoSourceIds.includes(p.id)}
                  onChange={(on) =>
                    edit(
                      (c) =>
                        void (c.screenSaver.photoSourceIds = on
                          ? [...c.screenSaver.photoSourceIds, p.id]
                          : c.screenSaver.photoSourceIds.filter((id) => id !== p.id)),
                    )
                  }
                />
              ))}
            </>
          ) : (
            <p className="text-xs text-soft">Add a photo album under Photos first; until then the screen goes dark instead.</p>
          )}
          <Toggle label="Show the time and date" checked={s.showClock} onChange={(v) => edit((c) => void (c.screenSaver.showClock = v))} />
        </>
      )}

      <Toggle
        label="Go dark at night"
        checked={s.night}
        hint="The screen is black between these times. A tap wakes it for a while, then it goes dark again."
        onChange={(v) => edit((c) => void (c.screenSaver.night = v))}
      />
      {s.night && (
        <div className="grid grid-cols-2 gap-3">
          <TimePicker
            label="From"
            value={s.nightStart}
            hour12={hour12}
            onChange={(v) => edit((c) => void (c.screenSaver.nightStart = v))}
          />
          <TimePicker label="Until" value={s.nightEnd} hour12={hour12} onChange={(v) => edit((c) => void (c.screenSaver.nightEnd = v))} />
        </div>
      )}

      {(s.idle || s.night) && (
        <>
          <Range
            label="Minutes without a touch"
            value={s.minutes}
            min={1}
            max={240}
            step={1}
            format={(n) => `${n} min`}
            hint="How long the dashboard stays up after the last touch or motion."
            onChange={(v) => edit((c) => void (c.screenSaver.minutes = v))}
          />
          <div className="grid gap-2 border-t border-line pt-3">
            <h3 className="text-sm font-semibold">Motion sensors</h3>
            <p className="text-xs text-soft">
              {haUrl
                ? "Home Assistant motion or occupancy sensors near the screen. While one sees someone, the screen stays awake, and it wakes when someone walks up."
                : "Connect Home Assistant under its settings to wake the screen when someone walks up."}
            </p>
            {haUrl &&
              motion.map((id, i) => (
                <Text
                  key={i}
                  label={`Sensor ${i + 1}`}
                  value={id}
                  maxLength={255}
                  placeholder="binary_sensor.hallway_motion"
                  list="ha-motion"
                  onChange={(v) =>
                    edit((c) => {
                      const ids = [...c.screenSaver.motionEntityIds];
                      ids[i] = v.trim();
                      c.screenSaver.motionEntityIds = ids.filter(Boolean).slice(0, MAX_MOTION);
                    })
                  }
                />
              ))}
            {haUrl && <HaEntityList id="ha-motion" only="binary_sensor." />}
          </div>
        </>
      )}
    </Section>
  );
}
