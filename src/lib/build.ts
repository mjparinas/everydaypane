// Which code this build was made from. next.config.ts stamps the commit; shown in the site footer as plain text
// with no GitHub link (same rule as Liftsmith and Tuned: Melvin, 2026-11-11).

/** The package version from package.json (NEXT_PUBLIC_APP_VERSION at build time). */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0";

/** The full commit hash, or "" when the build couldn't tell. */
export const COMMIT_SHA = process.env.NEXT_PUBLIC_COMMIT_SHA ?? "";

/** The short commit hash (7 characters), or "dev". */
export const COMMIT = shortCommit(COMMIT_SHA);

export function shortCommit(sha: string): string {
  const s = sha.trim().toLowerCase();
  return /^[0-9a-f]{7,40}$/.test(s) ? s.slice(0, 7) : "dev";
}
