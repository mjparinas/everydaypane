import "server-only";

import type { DashboardConfig } from "@/lib/config/schema";
import type { CalendarData } from "@/lib/display/types";

import { eventsInRange as familyEvents } from "./familyEvents";
import { calendarFeed, feedRange, GoogleDisconnected, sortEvents } from "./google";
import { icalEvents } from "./ical";

// The one calendar feed displays read: Google's chosen calendars, calendar links, and family events from /family/. Each source fails on its own,
// so a school calendar that is down never hides the family's Google events, or the other way round.

export interface Feed {
  data: CalendarData;
  /** False when there is nothing to show from: Google isn't connected and no link is switched on. */
  connected: boolean;
  stale: boolean;
}

export async function combinedFeed(accountId: string, config: DashboardConfig, now = Date.now()): Promise<Feed> {
  const links = config.integrations.icals.filter((l) => l.enabled);
  const { from, to } = feedRange(now, config.location.timeZone);
  const family = await familyEvents(accountId, from, to);

  let google: Awaited<ReturnType<typeof calendarFeed>> | null = null;
  let googleConnected = true;
  try {
    google = await calendarFeed(accountId, config, now);
  } catch (error) {
    if (error instanceof GoogleDisconnected) googleConnected = false;
    else if (!links.length && !family.length) throw error;
    else console.error("[calendar] Google failed", error);
  }

  if (!googleConnected && !links.length && !family.length)
    return { data: { updatedAt: now, from: "", to: "", events: [] }, connected: false, stale: false };

  const results = await Promise.allSettled(links.map((l) => icalEvents(accountId, l, from, to, config.location.timeZone, now)));
  const linked = results.flatMap((r, i) => {
    if (r.status === "fulfilled") return r.value;
    console.error(`[calendar] link ${links[i]?.id} failed`, r.reason);
    return [];
  });
  if (!google && results.every((r) => r.status === "rejected") && !family.length) {
    throw new Error("Every calendar failed");
  }
  return {
    data: {
      updatedAt: google?.value.updatedAt ?? now,
      from,
      to,
      events: sortEvents([...(google?.value.events ?? []), ...linked, ...family]).slice(0, 800),
    },
    connected: true,
    stale: google?.stale ?? false,
  };
}
