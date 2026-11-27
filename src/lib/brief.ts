import { meetsBanner, rank } from "@/lib/alerts";
import { addDays, eventDays, eventTime, localDate } from "@/lib/calendar";
import { upcoming } from "@/lib/config/countdown";
import type { CountdownEvent, DashboardConfig } from "@/lib/config/schema";
import { minutesInZone } from "@/lib/config/time";
import type {
  AlertData,
  BriefData,
  BriefItem,
  CalendarData,
  CommuteData,
  FerriesData,
  GarbageData,
  MealsData,
  SchoolData,
  WeatherData,
} from "@/lib/display/types";

// Morning brief (Melvin, 2026-11-26: "a morning brief that reads the day for you: Rain at 3, ferry delays, garbage
// tonight, Sam's dentist at 4"). The server reads the feeds the household already has and this turns them into short
// phrases, so the wall only paints text. Plain functions on trimmed feed data, tested without the network.

export { BRIEF_SOURCE_LABELS, BRIEF_SOURCES, type BriefSource } from "@/lib/briefSources";

/** From this local hour the brief reads tomorrow, so bedtime answers "what's on tomorrow?" (Claude's default, 2026-11-26). */
export const BRIEF_EVENING_HOUR = 19;

/** Whatever feeds the server could read; anything absent is left out of the brief. */
export interface BriefInput {
  now: number;
  timeZone: string;
  hour12: boolean;
  /** Read tomorrow from BRIEF_EVENING_HOUR. */
  eveningTomorrow: boolean;
  banner: DashboardConfig["alerts"]["banner"];
  weather?: WeatherData;
  alerts?: AlertData;
  school?: SchoolData;
  calendar?: CalendarData;
  countdowns?: readonly CountdownEvent[];
  garbage?: GarbageData;
  ferries?: FerriesData;
  commute?: CommuteData;
  meals?: MealsData;
}

/** The local hour (0–23) of a moment in a zone. */
export function localHour(ms: number, timeZone: string): number {
  return Math.floor(minutesInZone(new Date(ms), timeZone) / 60);
}

/** "3 PM" or "15:00" for a local hour. */
export function hourLabel(hour: number, hour12: boolean): string {
  if (!hour12) return `${String(hour).padStart(2, "0")}:00`;
  const h = hour % 12 || 12;
  return `${h} ${hour < 12 ? "AM" : "PM"}`;
}

/** WMO weather codes (Open-Meteo, and Environment Canada mapped to them) that mean something falling. */
export function precipKind(code: number): "rain" | "snow" | "thunder" | "" {
  if (code >= 95) return "thunder";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  return "";
}

const PRECIP_WORD = { rain: "Rain", snow: "Snow", thunder: "Thunderstorms" } as const;
const PRECIP_ICON = { rain: "🌧️", snow: "🌨️", thunder: "⛈️" } as const;

const listWords = (words: string[]) =>
  words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1] ?? ""}`;

/** An hour counts as wet when its code says so, or the chance is high enough to plan around. */
function wetKind(code: number, chance: number): "rain" | "snow" | "thunder" | "" {
  const kind = precipKind(code);
  if (kind && chance >= 30) return kind;
  return chance >= 60 ? kind || "rain" : "";
}

function weatherItem(w: WeatherData, day: "today" | "tomorrow", date: string, hour12: boolean): BriefItem | null {
  const deg = (n: number) => `${n}°`;
  if (day === "tomorrow") {
    const d = w.days.find((x) => x.date === date);
    if (!d) return null;
    const kind = wetKind(d.code, d.precip);
    const detail = `High of ${deg(d.max)}, low of ${deg(d.min)}`;
    if (kind) return { source: "weather", icon: PRECIP_ICON[kind], text: `${PRECIP_WORD[kind]} likely`, detail, tone: "" };
    return { source: "weather", icon: "🌤️", text: `Dry, high of ${deg(d.max)}`, detail: `Low of ${deg(d.min)}`, tone: "" };
  }
  const hours = w.hours.filter((h) => h.time.slice(0, 10) === date);
  const high = w.days.find((x) => x.date === date)?.max;
  const detail = high === undefined ? undefined : `High of ${deg(high)}`;
  const first = hours[0];
  if (!first) return null;
  const hourOf = (t: string) => Number(t.slice(11, 13));
  const nowKind = wetKind(first.code, first.precip);
  if (nowKind) {
    const dry = hours.find((h) => !wetKind(h.code, h.precip));
    const text = dry ? `${PRECIP_WORD[nowKind]} until ${hourLabel(hourOf(dry.time), hour12)}` : `${PRECIP_WORD[nowKind]} all day`;
    return { source: "weather", icon: PRECIP_ICON[nowKind], text, ...(detail ? { detail } : {}), tone: "" };
  }
  const wet = hours.find((h) => wetKind(h.code, h.precip));
  const kind = wet ? wetKind(wet.code, wet.precip) : "";
  if (wet && kind) {
    const text = `${PRECIP_WORD[kind]} at ${hourLabel(hourOf(wet.time), hour12)}`;
    return { source: "weather", icon: PRECIP_ICON[kind], text, ...(detail ? { detail } : {}), tone: "" };
  }
  return { source: "weather", icon: first.isDay ? "☀️" : "🌙", text: high === undefined ? "Dry" : `Dry, high of ${deg(high)}`, tone: "" };
}

function alertItems(a: AlertData, banner: DashboardConfig["alerts"]["banner"]): BriefItem[] {
  return a.alerts
    .filter((x) => !x.notice && meetsBanner(x.severity, banner === "never" ? "severe" : banner))
    .sort((x, y) => rank(x.severity) - rank(y.severity))
    .slice(0, 2)
    .map((x) => ({ source: "alerts", icon: "⚠️", text: x.title, tone: "alert" }));
}

function calendarItems(input: BriefInput, date: string, day: "today" | "tomorrow"): BriefItem[] {
  const out: BriefItem[] = [];
  const today = addDays(date, day === "tomorrow" ? -1 : 0);
  for (const u of upcoming(input.countdowns ?? [], today)) {
    if (u.date !== date) continue;
    const icon = u.event.emoji || (u.event.kind === "birthday" ? "🎂" : "🎉");
    const name = u.turning ? `${u.event.name} (turning ${u.turning})` : u.event.name;
    if (!out.some((o) => o.text === name)) out.push({ source: "calendar", icon, text: name, tone: "" });
  }
  const cal = input.calendar;
  if (!cal) return out;
  const seen = new Set<string>();
  const events = cal.events.filter((e) => {
    if (!eventDays(e, input.timeZone).includes(date)) return false;
    if (!e.allDay) {
      // Only what's still ahead: an event that started earlier today, or yesterday, isn't news.
      if (localDate(Date.parse(e.start), input.timeZone) !== date) return false;
      if (day === "today" && Date.parse(e.start) <= input.now) return false;
    }
    const key = `${e.title}|${e.allDay ? "" : e.start}`;
    if (seen.has(key) || out.some((o) => o.text === e.title)) return false;
    seen.add(key);
    return true;
  });
  events.sort((a, b) => Number(b.allDay) - Number(a.allDay) || Date.parse(a.start) - Date.parse(b.start));
  // Every event is named (Melvin, 2026-11-27: "says 3 more on the calendar, can you show them all?"); the wall shrinks
  // the text to fit instead.
  for (const e of events) {
    const text = e.allDay ? e.title : `${e.title} at ${eventTime(e, date, input.timeZone, input.hour12)}`;
    out.push({ source: "calendar", icon: e.allDay ? "📌" : "📅", text, ...(e.location ? { detail: e.location } : {}), tone: "" });
  }
  return out;
}

function garbageItem(g: GarbageData, date: string, today: string, hour: number): BriefItem | null {
  if (!g.configured) return null;
  const bins = (p: GarbageData["pickups"][number]) => {
    const names = p.bins.map((b, i) => (i === 0 ? b.name : b.name.toLowerCase()));
    return listWords(names);
  };
  const tomorrow = g.pickups.find((p) => p.date === addDays(today, 1));
  const todays = g.pickups.find((p) => p.date === today);
  // Pickup tomorrow: the bins go out tonight, whichever day the brief reads.
  if (tomorrow && tomorrow.bins.length && (date === today ? hour >= 12 || !todays : true))
    return { source: "garbage", icon: "🗑️", text: `${bins(tomorrow)} out tonight`, detail: "Pickup tomorrow", tone: "" };
  // Pickup today matters in the morning, before the truck comes.
  if (date === today && todays && todays.bins.length && hour < 12)
    return { source: "garbage", icon: "🗑️", text: `${bins(todays)} pickup today`, tone: "" };
  return null;
}

function ferryItems(f: FerriesData): BriefItem[] {
  if (f.down) return [];
  const out: BriefItem[] = [];
  for (const r of f.routes) {
    const cancelled = r.sailings.filter((s) => s.state === "cancelled");
    const delayed = r.sailings.filter((s) => s.state === "delayed");
    if (cancelled.length) {
      const times = cancelled.slice(0, 3).map((s) => s.time);
      const text = cancelled.length === 1 ? `Ferry cancelled at ${times[0] ?? ""}` : `${cancelled.length} ferry sailings cancelled`;
      out.push({ source: "ferries", icon: "⛴️", text, detail: r.name, tone: "warn" });
    } else if (delayed.length) {
      const worst = Math.max(0, ...delayed.map((s) => s.delayMinutes ?? 0));
      out.push({
        source: "ferries",
        icon: "⛴️",
        text: worst ? `Ferry delays up to ${worst} min` : "Ferry delays",
        detail: r.name,
        tone: "warn",
      });
    }
    if (out.length >= 2) break;
  }
  return out;
}

function commuteItems(c: CommuteData, now: number): BriefItem[] {
  if (c.missing) return [];
  return c.routes
    .filter((r) => {
      if (r.seconds === undefined || r.delaySeconds === undefined || !r.at || now - r.at > 20 * 60_000) return false;
      // Worth a mention: ten minutes or more lost, and at least a quarter longer than empty roads.
      return r.delaySeconds >= 600 && r.delaySeconds >= 0.25 * (r.freeFlowSeconds ?? r.seconds);
    })
    .slice(0, 2)
    .map((r) => ({
      source: "commute",
      icon: "🚗",
      text: `Heavy traffic to ${r.name}`,
      detail: `${Math.round((r.seconds ?? 0) / 60)} min, ${Math.round((r.delaySeconds ?? 0) / 60)} more than usual`,
      tone: "warn",
    }));
}

function mealItem(m: MealsData, date: string, day: "today" | "tomorrow", hour: number): BriefItem | null {
  const dinner = m.meals[date]?.dinner?.trim();
  if (!dinner || (day === "today" && hour >= 20)) return null;
  return { source: "meals", icon: "🍽️", text: `${dinner} for dinner`, tone: "" };
}

/** Lower-cases the first letter of our own phrases mid-sentence; event titles and alert names keep their capitals. */
function inSentence(item: BriefItem, first: boolean): string {
  if (first || item.source === "calendar" || item.source === "alerts" || item.source === "meals") return item.text;
  return item.text.charAt(0).toLowerCase() + item.text.slice(1);
}

export function composeBrief(input: BriefInput): BriefData {
  const { now, timeZone } = input;
  const hour = localHour(now, timeZone);
  const today = localDate(now, timeZone);
  const day = input.eveningTomorrow && hour >= BRIEF_EVENING_HOUR ? "tomorrow" : "today";
  const date = day === "tomorrow" ? addDays(today, 1) : today;
  const greeting = hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const items: BriefItem[] = [];
  const push = (i: BriefItem | null) => void (i && items.push(i));
  if (input.alerts) items.push(...alertItems(input.alerts, input.banner));
  // A school notice is about today; at bedtime tomorrow's hasn't been posted yet.
  if (input.school && day === "today" && (input.school.state === "closed" || input.school.state === "delayed"))
    push({ source: "school", icon: "🏫", text: input.school.summary, tone: "warn" });
  if (input.weather) push(weatherItem(input.weather, day, date, input.hour12));
  if (input.calendar || input.countdowns) items.push(...calendarItems(input, date, day));
  if (input.garbage) push(garbageItem(input.garbage, date, today, hour));
  // Ferries and traffic are live readings, only worth saying about the rest of today.
  if (day === "today" && input.ferries) items.push(...ferryItems(input.ferries));
  if (day === "today" && input.commute) items.push(...commuteItems(input.commute, now));
  if (input.meals) push(mealItem(input.meals, date, day, hour));

  const summary = items.length
    ? `${items.map((i, n) => inSentence(i, n === 0)).join(", ")}.`
    : day === "tomorrow"
      ? "Nothing planned for tomorrow."
      : "A quiet day, with nothing planned.";
  return { updatedAt: now, greeting, day, date, summary, items };
}
