// Border wait times (Melvin, 2026-11-25: "build that all", from a list that named border waits): the Lower Mainland
// crossings into Washington, each with CBSA's name for its office (Canada-bound waits, bwt-eng.csv) and CBP's port
// number (U.S.-bound waits, bwt.cbp.gov). Kept free of zod so the admin, the server and the display can all import it.

/** West to east, as the settings list them. */
export const BORDER_CROSSINGS = ["boundaryBay", "peaceArch", "pacificHighway", "aldergrove", "huntingdon"] as const;
export type BorderCrossing = (typeof BORDER_CROSSINGS)[number];

export const BORDER_DEFAULT_CROSSINGS: BorderCrossing[] = ["peaceArch", "pacificHighway", "aldergrove"];

export const BORDER_INFO: Record<BorderCrossing, { name: string; detail: string; cbsa: string; cbp: string }> = {
  // CBSA calls Peace Arch "Douglas"; CBP numbers Blaine's two crossings 300401 (Pacific Highway) and 300402 (Peace Arch).
  peaceArch: { name: "Peace Arch", detail: "Douglas / Blaine", cbsa: "douglas", cbp: "300402" },
  pacificHighway: { name: "Pacific Highway", detail: "Surrey / Blaine", cbsa: "pacific highway", cbp: "300401" },
  aldergrove: { name: "Aldergrove", detail: "Aldergrove / Lynden", cbsa: "aldergrove", cbp: "302301" },
  huntingdon: { name: "Abbotsford", detail: "Huntingdon / Sumas", cbsa: "huntingdon", cbp: "300901" },
  boundaryBay: { name: "Point Roberts", detail: "Boundary Bay / Point Roberts", cbsa: "boundary bay", cbp: "300403" },
};

export const BORDER_DIRECTIONS = ["both", "toUS", "toCanada"] as const;
export type BorderDirections = (typeof BORDER_DIRECTIONS)[number];

export const BORDER_DIRECTION_LABELS: Record<BorderDirections, string> = {
  both: "Both directions",
  toUS: "Into the U.S. only",
  toCanada: "Into Canada only",
};

/** Green up to 15 minutes, amber up to 45, red beyond. */
export function waitLevel(minutes: number): 1 | 2 | 3 {
  return minutes <= 15 ? 1 : minutes <= 45 ? 2 : 3;
}
