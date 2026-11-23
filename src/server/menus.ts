import "server-only";

import type { DashboardConfig, WidgetOf } from "@/lib/config/schema";
import type { MenusData } from "@/lib/display/types";
import type { MealSlot } from "@/lib/meals";

import { cached, type Cached } from "./cache";

// Nutrislice school menus (Phase 4, Household). Published JSON only — never written to the meals table (docs/menus.md).

const TTL = 30 * 60_000;

interface NutrisliceItem {
  food?: { name?: string };
  name?: string;
}

interface NutrisliceMenu {
  date?: string;
  menu_items?: NutrisliceItem[];
}

interface NutrisliceDay {
  date?: string;
  menu_types?: { name?: string; sections?: { menu_items?: NutrisliceItem[] }[] }[];
}

function itemName(item: NutrisliceItem): string {
  return (item.food?.name ?? item.name ?? "").trim();
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function localToday(timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  return new Date(y, m - 1, d);
}

export function parseNutrisliceDay(raw: unknown, meal: MealSlot): string[] {
  const body = raw as NutrisliceMenu | NutrisliceDay;
  const items: string[] = [];
  if ("menu_items" in body && Array.isArray(body.menu_items)) {
    for (const item of body.menu_items) {
      const name = itemName(item);
      if (name) items.push(name);
    }
    return items;
  }
  const types = (body as NutrisliceDay).menu_types ?? [];
  const match = types.find((t) => (t.name ?? "").toLowerCase().includes(meal));
  for (const section of match?.sections ?? []) {
    for (const item of section.menu_items ?? []) {
      const name = itemName(item);
      if (name) items.push(name);
    }
  }
  return items.slice(0, 30);
}

export function trimMenus(
  slug: string,
  school: string,
  slots: MealSlot[],
  byDate: Record<string, Partial<Record<MealSlot, string[]>>>,
  now: number,
): MenusData {
  return { updatedAt: now, slug, school, days: byDate, slots, stale: false };
}

async function fetchMeal(slug: string, school: string, meal: string, date: string): Promise<string[]> {
  const url = `https://${slug}.api.nutrislice.com/menu/api/weeks/school/${encodeURIComponent(school)}/menu-type/${meal}/date/${date}/`;
  const r = await fetch(url, {
    headers: { "User-Agent": "Everydaypane/1.0", Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) return [];
  return parseNutrisliceDay(await r.json(), meal as MealSlot); // nutrislice meal type names differ from family meal slots
}

export async function menusDashboardFeed(
  accountId: string,
  config: DashboardConfig,
  now = Date.now(),
): Promise<Cached<{ updatedAt: number; byWidget: Record<string, MenusData> }>> {
  const widgets: WidgetOf<"menus">[] = [];
  for (const view of config.views) for (const w of view.widgets) if (w.type === "menus") widgets.push(w);
  const key = `menus-all:${accountId}:${widgets.map((w) => `${w.id}:${w.school}:${w.days}:${w.slots.join(",")}`).join("|")}`;
  return cached(
    key,
    TTL,
    async () => {
      const byWidget: Record<string, MenusData> = {};
      for (const w of widgets) byWidget[w.id] = await loadMenusWidget(accountId, config, w, now);
      return { updatedAt: now, byWidget };
    },
    now,
  );
}

async function loadMenusWidget(accountId: string, config: DashboardConfig, widget: WidgetOf<"menus">, now: number): Promise<MenusData> {
  const slug = config.integrations.smartHome.menus.slug.trim();
  const school = widget.school.trim() || config.integrations.smartHome.menus.schoolName.trim();
  const slots = widget.slots.length ? widget.slots : (["lunch"] as const);
  const empty: MenusData = { updatedAt: now, slug, school, days: {}, slots: [...slots], stale: false };
  if (!slug || !school) return empty;

  const tz = config.location.timeZone;
  const start = localToday(tz);
  const days: MenusData["days"] = {};
  for (let i = 0; i < widget.days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const path = dayKey(d);
    const meals: Partial<Record<MealSlot, string[]>> = {};
    for (const slot of slots) {
      const nutrisliceMeal = slot === "breakfast" ? "breakfast" : slot === "dinner" ? "dinner" : "lunch";
      meals[slot] = await fetchMeal(slug, school, nutrisliceMeal, path);
    }
    days[iso] = meals;
  }
  return trimMenus(slug, school, [...slots], days, now);
}
