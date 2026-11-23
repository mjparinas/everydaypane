/** Platform admin tabs — Tuned order, Everydaypane names (Households / Displays). */
export const ADMIN_TABS = [
  "Overview",
  "To Do",
  "Inbox",
  "Reports",
  "Traffic",
  "Acquisition",
  "Funnel",
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

export const ADMIN_TAB_GROUPS: readonly { label: string; tabs: readonly AdminTab[] }[] = [
  { label: "Work", tabs: ["Overview", "To Do", "Inbox", "Reports"] },
  { label: "Numbers", tabs: ["Traffic", "Acquisition", "Funnel", "Devices", "Revenue", "Codes"] },
  { label: "People", tabs: ["Households", "Displays"] },
  { label: "Running", tabs: ["Flags", "Automations", "System", "Log"] },
];

export const PERIOD_TABS: ReadonlySet<AdminTab> = new Set(["Overview", "Traffic", "Acquisition", "Funnel", "Devices", "Revenue"]);

export const OPEN_TABS: ReadonlySet<AdminTab> = new Set(["Households", "Displays", "Inbox", "Reports"]);

export function isAdminTab(v: string): v is AdminTab {
  return (ADMIN_TABS as readonly string[]).includes(v);
}
