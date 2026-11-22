import type { SchoolData } from "@/lib/display/types";

// Which closure a school widget shows (Melvin, 2026-11-22). The district page is read once; each widget then keeps a
// notice that names one of its schools, or that covers every school. An empty list shows the district notice as it is.

/** True when a closure or delay notice applies to the schools this widget watches. */
export function schoolForWidget(data: SchoolData, schools: string[]): SchoolData {
  if (data.state !== "closed" && data.state !== "delayed") return data;
  const wanted = schools.map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (wanted.length === 0) return data;
  const text = `${data.summary} ${data.detail}`.toLowerCase();
  if (/\ball schools\b/.test(text) || /\bevery school\b/.test(text) || /\bentire district\b/.test(text) || /\bdistrict-wide\b/.test(text))
    return data;
  if (wanted.some((name) => text.includes(name))) return data;
  return { ...data, state: "open", summary: "Open", detail: "" };
}
