"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { Widget, WidgetType } from "@/lib/config/schema";
import { settingsSectionOn, widgetAllowed, widgetFlag } from "@/lib/featureFlags";

// Platform feature flags in the household panel (Melvin, 2026-11-26). The page hands over the flag names that are
// off for this household; a switched-off widget leaves the picker and its Settings card disappears. Nothing here is
// a security boundary: the server drops switched-off integrations from every display feed on its own.
// `unconfigured` names widgets and providers whose Everydaypane API key is missing on this deploy (Melvin, 2026-11-26:
// "if there's a widget that needs keys, don't show it in /household unless it's set"). They aren't offered (picker,
// provider cards, Settings cards), but unlike a flag they aren't "off": a widget already placed keeps its settings and
// the wall keeps drawing it with its own "not set up" message.

type FlagsValue = { off: ReadonlySet<string>; on: (name: string) => boolean; widgetOn: (type: WidgetType) => boolean };

const empty: ReadonlySet<string> = new Set();
const NONE: readonly string[] = [];
const FlagsContext = createContext<FlagsValue>({ off: empty, on: () => true, widgetOn: () => true });

export function FlagsProvider({
  off,
  unconfigured = NONE,
  children,
}: {
  off: readonly string[];
  unconfigured?: readonly string[];
  children: ReactNode;
}) {
  const value = useMemo((): FlagsValue => {
    const set = new Set(off);
    const hidden = new Set([...off, ...unconfigured]);
    return { off: set, on: (name) => !hidden.has(name), widgetOn: (type) => !hidden.has(widgetFlag(type)) };
  }, [off, unconfigured]);
  return <FlagsContext.Provider value={value}>{children}</FlagsContext.Provider>;
}

export function useFlags(): FlagsValue {
  return useContext(FlagsContext);
}

/** Renders its children only while every named flag is on. */
export function Flagged({ name, children }: { name: string | string[]; children: ReactNode }) {
  const { on } = useFlags();
  const names = Array.isArray(name) ? name : [name];
  return names.every(on) ? <>{children}</> : null;
}

/** Renders its children while any of the named flags is on (a card shared by several widgets). */
export function FlaggedAny({ names, children }: { names: string[]; children: ReactNode }) {
  const { on } = useFlags();
  return names.some(on) ? <>{children}</> : null;
}

/** True when the wall will draw this widget; false when a platform flag has switched it off. */
export function useWidgetLive(widget: Widget | undefined): boolean {
  const { off } = useFlags();
  return !widget || widgetAllowed(widget, off);
}

/** Shows a Settings card unless every flag it needs (SETTINGS_FLAGS) is off. */
export function FlaggedSettings({ section, children }: { section: string; children: ReactNode }) {
  const { on } = useFlags();
  return settingsSectionOn(section, on) ? <>{children}</> : null;
}
