"use client";

// Homepage screen shots — real template previews from public/templates/ (same PNGs as the Views tab).
import { useEffect, useState } from "react";

type Variant = "morning" | "family" | "commute" | "photos" | "night";

type Shot = { src: string; title: string; width: number; height: number };

const SHOTS: Record<Variant, Shot> = {
  morning: {
    src: "/templates/kitchen-glance.png",
    title: "Kitchen Glance — Clock, Weather, Today's Schedule and Photos",
    width: 1280,
    height: 720,
  },
  family: {
    src: "/templates/family-hub.png",
    title: "Family Hub — Chores, Meals, Messages and Who's Home",
    width: 1280,
    height: 720,
  },
  commute: {
    src: "/templates/commute-dash.png",
    title: "Commute Dash — Buses, Drive Times and Rain Radar",
    width: 1280,
    height: 720,
  },
  photos: {
    src: "/templates/photo-frame.png",
    title: "Photo frame — photos fill the wall with a clock and date",
    width: 1280,
    height: 720,
  },
  night: {
    src: "/templates/night-clock.png",
    title: "Night clock — big time, quiet weather and a Wi‑Fi code",
    width: 1280,
    height: 720,
  },
};

/** Hero gallery — a few more starter layouts so the pane keeps moving. */
const GALLERY: Shot[] = [
  SHOTS.morning,
  SHOTS.family,
  {
    src: "/templates/calendar-wall.png",
    title: "Calendar Wall — Month Grid with the Week Ahead",
    width: 1280,
    height: 720,
  },
  SHOTS.commute,
  {
    src: "/templates/kids-routine.png",
    title: "Kids Routine — Chores, Timers and the Day's Plan",
    width: 1280,
    height: 720,
  },
  SHOTS.photos,
  {
    src: "/templates/smart-home.png",
    title: "Smart Home — Lights, Climate and Who's Home",
    width: 1280,
    height: 720,
  },
  SHOTS.night,
];

const CYCLE_MS = 4500;

export function PaneMock({
  variant,
  className = "",
  priority = false,
  cycle = false,
}: {
  variant: Variant;
  className?: string;
  /** Hero (above the fold) — skip lazy load. */
  priority?: boolean;
  /** Crossfade through several starter screenshots. */
  cycle?: boolean;
}) {
  if (cycle) {
    return <PaneGallery className={className} priority={priority} />;
  }
  const shot = SHOTS[variant];
  return (
    <figure className={`pane-mock ${className}`}>
      <div className="pane-bezel">
        <div className="pane-chrome" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- static marketing shot from /public */}
        <img
          className="pane-shot"
          src={shot.src}
          alt={shot.title}
          width={shot.width}
          height={shot.height}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : undefined}
        />
      </div>
      <figcaption className="mt-3 text-center text-sm text-soft">{shot.title}</figcaption>
    </figure>
  );
}

function PaneGallery({ className = "", priority = false }: { className?: string; priority?: boolean }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || GALLERY.length < 2) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % GALLERY.length);
    }, CYCLE_MS);
    return () => window.clearInterval(id);
  }, [paused]);

  const active = GALLERY[index]!;

  return (
    <figure
      className={`pane-mock ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <div className="pane-bezel">
        <div className="pane-chrome" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <div className="pane-gallery" aria-roledescription="carousel" aria-label="Everydaypane starter screens">
          {GALLERY.map((shot, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- static marketing shot from /public
            <img
              key={shot.src}
              className={`pane-shot pane-gallery-shot${i === index ? " is-active" : ""}`}
              src={shot.src}
              alt={i === index ? shot.title : ""}
              width={shot.width}
              height={shot.height}
              loading={i === 0 && priority ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={i === 0 && priority ? "high" : undefined}
              aria-hidden={i === index ? undefined : true}
            />
          ))}
        </div>
        <div className="pane-gallery-dots" role="tablist" aria-label="Choose a screen">
          {GALLERY.map((shot, i) => (
            <button
              key={shot.src}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={shot.title}
              className={`pane-gallery-dot${i === index ? " is-active" : ""}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      </div>
      <figcaption className="mt-3 text-center text-sm text-soft" aria-live="polite">
        {active.title}
      </figcaption>
    </figure>
  );
}

// Homepage screen saver feature (Melvin, 2026-11-26: the photo frame screen saver should be featured on the homepage):
// the same pane flips between the dashboard in use and the idle photo frame, the way the wall does after a few quiet minutes.
const IDLE_STATES = [
  { label: "In Use", shot: SHOTS.morning, ms: 3500 },
  { label: "Nobody Around", shot: { ...SHOTS.photos, title: "A few quiet minutes later, the wall becomes a photo frame" }, ms: 5000 },
] as const;

export function IdleFrameMock({ className = "" }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % IDLE_STATES.length), IDLE_STATES[index]!.ms);
    return () => window.clearTimeout(id);
  }, [index, paused]);

  const active = IDLE_STATES[index]!;
  return (
    <figure
      className={`pane-mock ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <div className="pane-bezel">
        <div className="pane-chrome" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <div className="pane-gallery">
          {IDLE_STATES.map((s, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- static marketing shot from /public
            <img
              key={s.shot.src}
              className={`pane-shot pane-gallery-shot${i === index ? " is-active" : ""}`}
              src={s.shot.src}
              alt={i === index ? s.shot.title : ""}
              width={s.shot.width}
              height={s.shot.height}
              loading="lazy"
              decoding="async"
              aria-hidden={i === index ? undefined : true}
            />
          ))}
        </div>
      </div>
      <div className="mt-3 flex justify-center gap-2" role="group" aria-label="Show the wall">
        {IDLE_STATES.map((s, i) => (
          <button
            key={s.label}
            type="button"
            aria-pressed={i === index}
            className={`min-h-11 rounded-xl border px-4 text-sm font-semibold transition-colors ${
              i === index ? "border-brand bg-brand text-brand-ink" : "border-line bg-panel text-soft hover:text-ink"
            }`}
            onClick={() => setIndex(i)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <figcaption className="mt-2 text-center text-sm text-soft" aria-live="polite">
        {active.shot.title}
      </figcaption>
    </figure>
  );
}
