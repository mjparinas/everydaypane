"use client";

import { featureFlag } from "@/lib/featureFlags";

import { Range, Section, Select, Text, Toggle } from "./fields";
import { useFlags } from "./flags";
import { HaEntityList } from "./haEntities";
import { HouseholdBadge, usePlan } from "./plan";
import { useAdmin } from "./store";
import { formatDisplay, TimePicker } from "./TimePicker";

const MAX_MOTION = 5;

/** Blog guide linked from Settings (Melvin, 2026-11-26: a post on what the screen saver is and how it works). */
export const SCREEN_SAVER_GUIDE = "/blog/photo-frame-screen-saver/";

// Settings › Home card (Melvin, 2026-11-26: the screen saver "needs to be more prominent in the settings"): says what
// the screen saver does now, or what it could do, and jumps to the full panel under Screen saver & alerts.
export function ScreenSaverSummary({ onOpen }: { onOpen: () => void }) {
  const s = useAdmin((st) => st.config.screenSaver);
  const views = useAdmin((st) => st.config.views);
  const hour12 = useAdmin((st) => st.config.hour12);
  const { isPaid, openUpgrade } = usePlan();
  const idleView = views.find((v) => v.id === s.viewId);
  const after = `after ${s.minutes} ${s.minutes === 1 ? "minute" : "minutes"} without a touch`;
  const status = !s.idle
    ? null
    : s.shows === "view"
      ? `Shows the ${idleView?.name ? `“${idleView.name}”` : "idle"} view ${after}.`
      : s.shows === "photos"
        ? `Shows photos full screen ${after}.`
        : `Goes dark ${after}.`;
  const on = s.idle || s.night;

  return (
    <Section id="settings-screen-saver-summary" title="Screen Saver" actions={isPaid ? undefined : <HouseholdBadge />}>
      {on ? (
        <p className="text-sm text-soft">
          <strong className="text-ink">On.</strong> {status}
          {s.night
            ? `${status ? " " : ""}Dark at night from ${formatDisplay(s.nightStart, hour12)} to ${formatDisplay(s.nightEnd, hour12)}.`
            : ""}
        </p>
      ) : (
        <p className="text-sm text-soft">
          Turn the wall into a <strong className="text-ink">photo frame</strong> when nobody&rsquo;s using it. After a few minutes with no
          touch it shows a view you design, like the Photo frame starter, and a tap brings the dashboard straight back.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {isPaid ? (
          <button type="button" className={on ? "btn-ghost" : "btn-primary"} onClick={onOpen}>
            {on ? "Change Screen Saver" : "Set Up the Screen Saver"}
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={() => openUpgrade("screenSaver")}>
            See Why Household
          </button>
        )}
        <a href={SCREEN_SAVER_GUIDE} target="_blank" rel="noopener" className="text-sm font-semibold text-brand hover:underline">
          How It Works
        </a>
      </div>
    </Section>
  );
}

// Settings › Screen saver (Melvin, 2026-11-21): photos only or dark after some idle minutes, dark at night, and Home
// Assistant motion sensors that wake the screen. The display side is src/display/saver.ts.
export function ScreenSaverPanel() {
  const s = useAdmin((st) => st.config.screenSaver);
  const hour12 = useAdmin((st) => st.config.hour12);
  const sources = useAdmin((st) => st.config.integrations.photos.sources);
  const haUrl = useAdmin((st) => st.config.integrations.homeAssistant.url);
  const views = useAdmin((st) => st.config.views);
  const edit = useAdmin((st) => st.edit);
  // Staff can switch the idle view off platform-wide; a saved "view" choice stays listed so the select isn't blank.
  const idleViewOn = useFlags().on(featureFlag("idleView")) || s.shows === "view";
  const motion = s.motionEntityIds.length < MAX_MOTION ? [...s.motionEntityIds, ""] : s.motionEntityIds;

  return (
    <Section
      title="Screen Saver"
      actions={
        <a href={SCREEN_SAVER_GUIDE} target="_blank" rel="noopener" className="text-sm font-semibold text-brand hover:underline">
          How It Works
        </a>
      }
    >
      <Toggle
        label="When Nobody's Using It"
        checked={s.idle}
        hint="After a while with no touch, the screen shows photos, a view of your choice, or goes dark. A tap brings the dashboard back."
        onChange={(v) => edit((c) => void (c.screenSaver.idle = v))}
      />
      {s.idle && (
        <Select
          label="Show"
          value={s.shows}
          options={[
            { value: "photos", label: "Photos, Full Screen" },
            ...(idleViewOn ? [{ value: "view" as const, label: "A View (Like a Photo Frame)" }] : []),
            { value: "dark", label: "Nothing (Dark Screen)" },
          ]}
          onChange={(v) =>
            edit((c) => {
              c.screenSaver.shows = v;
              // Start on a view so the setting saves; the first view is as good a guess as any.
              if (v === "view" && !c.views.some((x) => x.id === c.screenSaver.viewId)) c.screenSaver.viewId = c.views[0]?.id;
            })
          }
        />
      )}
      {s.idle && s.shows === "view" && (
        <>
          <Select
            label="Idle View"
            value={s.viewId ?? ""}
            options={views.map((v) => ({ value: v.id, label: v.name }))}
            onChange={(v) => edit((c) => void (c.screenSaver.viewId = v))}
          />
          <p className="text-xs text-soft">
            Build it in Views like any other view. The Photo frame starter template is a good start: photos with the time on top. A tap goes
            back to the view the display would be showing now, and the tap never presses anything on the idle view.
          </p>
        </>
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
          <Toggle label="Show the Time and Date" checked={s.showClock} onChange={(v) => edit((c) => void (c.screenSaver.showClock = v))} />
        </>
      )}

      <Toggle
        label="Go Dark at Night"
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
            label="Minutes Without a Touch"
            value={s.minutes}
            min={1}
            max={240}
            step={1}
            format={(n) => `${n} min`}
            hint="How long the dashboard stays up after the last touch or motion."
            onChange={(v) => edit((c) => void (c.screenSaver.minutes = v))}
          />
          <div className="grid gap-2 border-t border-line pt-3">
            <h3 className="text-sm font-semibold">Motion Sensors</h3>
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
