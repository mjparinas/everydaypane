// The Everydaypane wordmark, in ink on light screens and in pale ink on dark ones (follows the system setting, as the
// admin panel's colours do). Plain <img> tags: they're small static SVGs, so next/image has nothing to optimize.
export function Wordmark({ height = 32, className = "" }: { height?: number; className?: string }) {
  // The SVG is 16623 × 2732 units, about 6.08 times wider than tall.
  const width = Math.round(height * (16623 / 2732));
  return (
    <picture className={className}>
      <source srcSet="/brand/wordmark-dark.svg" media="(prefers-color-scheme: dark)" />
      <img src="/brand/wordmark-light.svg" alt="Everydaypane" width={width} height={height} className="block" />
    </picture>
  );
}

/** The square mark on its own, for headers where the name is already written out. */
export function Mark({ size = 32, className = "" }: { size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/mark.svg" alt="" width={size} height={size} className={`block shrink-0 ${className}`} />;
}
