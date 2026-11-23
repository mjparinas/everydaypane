import { APP_VERSION, COMMIT } from "@/lib/build";

/** Version and short GitHub build hash as plain text — no links (Melvin, 2026-11-11 / 2026-11-23). */
export function BuildStamp({ className = "" }: { className?: string }) {
  return (
    <span className={`tabular-nums ${className}`}>
      v{APP_VERSION} · {COMMIT}
    </span>
  );
}
