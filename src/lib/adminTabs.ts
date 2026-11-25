/** Platform admin tabs — Tuned order, Everydaypane names (Households / Displays). */
export const ADMIN_TABS = [
  "Overview",
  "To Do",
  "Inbox",
  "Reports",
  "Traffic",
  "Devices",
  "Revenue",
  "Codes",
  "Households",
  "Displays",
  "Flags",
  "Automations",
  "System",
  "Log",
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number];

/** Old Numbers tabs collapsed into Overview / Traffic (Melvin ops cockpit distill, 2026-11-24). */
const LEGACY_TABS: Readonly<Record<string, AdminTab>> = {
  Acquisition: "Traffic",
  Funnel: "Overview",
};

export const ADMIN_TAB_GROUPS: readonly { label: string; tabs: readonly AdminTab[] }[] = [
  { label: "Work", tabs: ["Overview", "To Do", "Inbox", "Reports"] },
  { label: "Numbers", tabs: ["Traffic", "Devices", "Revenue", "Codes"] },
  { label: "People", tabs: ["Households", "Displays"] },
  { label: "Running", tabs: ["Flags", "Automations", "System", "Log"] },
];

export const PERIOD_TABS: ReadonlySet<AdminTab> = new Set(["Overview", "Traffic", "Devices", "Revenue"]);

export const OPEN_TABS: ReadonlySet<AdminTab> = new Set(["Households", "Displays", "Inbox", "Reports"]);

export function isAdminTab(v: string): v is AdminTab {
  return (ADMIN_TABS as readonly string[]).includes(v);
}

/** Resolve a URL tab, including retired Acquisition / Funnel deep links. */
export function resolveAdminTab(raw: string | null | undefined): AdminTab {
  const v = raw || "Overview";
  if (isAdminTab(v)) return v;
  return LEGACY_TABS[v] ?? "Overview";
}

export function adminGroupFor(tab: AdminTab): (typeof ADMIN_TAB_GROUPS)[number] {
  return ADMIN_TAB_GROUPS.find((g) => g.tabs.includes(tab)) ?? ADMIN_TAB_GROUPS[0]!;
}

/** Wall UA metrics tab stays keyed `Devices` in URLs; label is Browsers so it doesn’t collide with Displays. */
export function adminTabLabel(tab: AdminTab): string {
  return tab === "Devices" ? "Browsers" : tab;
}
