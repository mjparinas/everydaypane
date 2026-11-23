// Homepage screen shots — real template previews from public/templates/ (same PNGs as the Views tab).

type Variant = "morning" | "family" | "commute" | "photos" | "night";

const SHOTS: Record<Variant, { src: string; title: string; width: number; height: number }> = {
  morning: {
    src: "/templates/kitchen-glance.png",
    title: "Kitchen glance — clock, weather, today's schedule and photos",
    width: 1280,
    height: 720,
  },
  family: {
    src: "/templates/family-hub.png",
    title: "Family hub — chores, meals, messages and who's home",
    width: 1280,
    height: 720,
  },
  commute: {
    src: "/templates/commute-dash.png",
    title: "Commute dash — buses, drive times and rain radar",
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

export function PaneMock({
  variant,
  className = "",
  priority = false,
}: {
  variant: Variant;
  className?: string;
  /** Hero (above the fold) — skip lazy load. */
  priority?: boolean;
}) {
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
