"use client";

import { useMemo, useState } from "react";

import type { WidgetType } from "@/lib/config/schema";
import { WIDGET_GROUPS, WIDGET_TYPES, WIDGETS } from "@/lib/config/widgets";
import { isFreeWidgetType } from "@/lib/plans";

import { Text } from "./fields";
import { HouseholdBadge, usePlan } from "./plan";
import { SlideDrawer } from "./SlideDrawer";

// Right slide-out widget picker (Melvin, 2026-11-22): same chrome as Edit view / widget settings so the live
// layout stays visible while choosing what to add. Free greys Household widgets and opens upgrade (2026-11-23).
// Critique quieter 2026-11-24: lead with four kitchen recommendations; full catalogue behind disclosure; paid
// widgets demoted to one Household bucket on Free.

/** Kitchen defaults — clock, weather, schedule, photos (critique P1). */
const RECOMMENDED: WidgetType[] = ["clock", "weather", "agenda", "photos"];

type CatalogueGroup = { id: string; label: string; types: WidgetType[] };

function WidgetCard({
  type,
  locked,
  onPick,
  onUpgrade,
}: {
  type: WidgetType;
  locked: boolean;
  onPick: (type: WidgetType) => void;
  onUpgrade: () => void;
}) {
  return (
    <button
      type="button"
      className={`card grid gap-1 p-3 text-left ${locked ? "opacity-55 grayscale-[0.35] hover:opacity-80" : "hover:border-brand"}`}
      onClick={() => {
        if (locked) {
          onUpgrade();
          return;
        }
        onPick(type);
      }}
    >
      <span className="flex items-start justify-between gap-1">
        <span className="text-2xl" aria-hidden="true">
          {WIDGETS[type].icon}
        </span>
        {locked ? <HouseholdBadge /> : null}
      </span>
      <span className="font-semibold">{WIDGETS[type].label}</span>
      <span className="text-xs text-soft">{WIDGETS[type].description}</span>
    </button>
  );
}

function GroupGrid({
  group,
  isPaid,
  onPick,
  openUpgrade,
}: {
  group: CatalogueGroup;
  isPaid: boolean;
  onPick: (type: WidgetType) => void;
  openUpgrade: () => void;
}) {
  if (group.types.length === 0) return null;
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-semibold text-soft">{group.label}</h3>
      <div className="grid grid-cols-2 gap-2">
        {group.types.map((t) => (
          <WidgetCard key={t} type={t} locked={!isPaid && !isFreeWidgetType(t)} onPick={onPick} onUpgrade={() => openUpgrade()} />
        ))}
      </div>
    </div>
  );
}

export function AddWidgetDrawer({ onClose, onPick }: { onClose: () => void; onPick: (type: WidgetType) => void }) {
  const { isPaid, openUpgrade } = usePlan();
  const [query, setQuery] = useState("");
  const [browseAll, setBrowseAll] = useState(false);

  const filteredTypes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return WIDGET_TYPES.filter((t) => {
      const info = WIDGETS[t];
      return info.label.toLowerCase().includes(q) || info.description.toLowerCase().includes(q);
    });
  }, [query]);

  const catalogueGroups = useMemo((): CatalogueGroup[] => {
    if (isPaid) {
      return WIDGET_GROUPS.map((g) => ({ id: g.id, label: g.label, types: [...g.types] }));
    }
    const freeGroups: CatalogueGroup[] = WIDGET_GROUPS.map((g) => ({
      id: g.id,
      label: g.label,
      types: g.types.filter((t) => isFreeWidgetType(t)),
    })).filter((g) => g.types.length > 0);
    const householdTypes = WIDGET_TYPES.filter((t) => !isFreeWidgetType(t));
    return [...freeGroups, { id: "household", label: "Household widgets", types: householdTypes }];
  }, [isPaid]);

  const searching = filteredTypes !== null;
  const showRecommended = !searching && !browseAll;
  const showCatalogue = searching || browseAll;

  return (
    <SlideDrawer title="Add a widget" openKey="add-widget" onClose={onClose} testId="add-widget-drawer" closeLabel="Close widget picker">
      <Text label="Search widgets" value={query} maxLength={40} placeholder="Clock, weather…" onChange={setQuery} />
      {!isPaid && (
        <p className="rounded-xl bg-bg p-3 text-xs text-soft">
          Core widgets are free. Ones marked <HouseholdBadge className="align-middle" /> open Household details instead of adding.
        </p>
      )}

      {showRecommended && (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold text-soft">Recommended for this view</h3>
          <div className="grid grid-cols-2 gap-2">
            {RECOMMENDED.map((t) => (
              <WidgetCard key={t} type={t} locked={false} onPick={onPick} onUpgrade={() => openUpgrade("widget")} />
            ))}
          </div>
          <button type="button" className="btn-ghost mt-1 justify-self-start" onClick={() => setBrowseAll(true)}>
            Browse all widgets
          </button>
        </div>
      )}

      {showCatalogue &&
        (searching
          ? [{ id: "search", label: "Matches", types: filteredTypes }].map((group) => (
              <GroupGrid key={group.id} group={group} isPaid={isPaid} onPick={onPick} openUpgrade={() => openUpgrade("widget")} />
            ))
          : catalogueGroups.map((group) => (
              <GroupGrid key={group.id} group={group} isPaid={isPaid} onPick={onPick} openUpgrade={() => openUpgrade("widget")} />
            )))}

      {browseAll && !searching && (
        <button type="button" className="btn-ghost justify-self-start text-soft" onClick={() => setBrowseAll(false)}>
          Show recommended only
        </button>
      )}
    </SlideDrawer>
  );
}
