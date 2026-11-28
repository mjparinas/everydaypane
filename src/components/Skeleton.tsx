import type { CSSProperties, ReactNode } from "react";

// Loading skeletons for the household, family and kitchen edit pages (Melvin, 2026-11-27: "add skeletons to each page
// while the user waits for it to load"). Each one takes the shape of what replaces it, at the same size, so nothing
// jumps when the data arrives. The pulse is opacity only and stops under reduced motion (motion-safe). Never used on
// the wall display, which has no React.

/** One grey placeholder block. Size it with classes the way the real element is sized. */
export function Bone({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={`block rounded-lg bg-line motion-safe:animate-pulse ${className}`} style={style} />;
}

/** Wraps a skeleton so screen readers hear one "Loading…" instead of nothing. */
export function SkeletonRegion({
  label = "Loading…",
  className = "",
  children,
  as: Tag = "div",
}: {
  label?: string;
  className?: string;
  children: ReactNode;
  as?: "div" | "section" | "main";
}) {
  return (
    <Tag className={className} role="status" aria-busy="true" aria-live="polite" data-skeleton="">
      <span className="sr-only">{label}</span>
      {children}
    </Tag>
  );
}

/** A button-sized block (min-h-11 like `btn`). */
export function ButtonBone({ className = "w-24" }: { className?: string }) {
  return <Bone className={`h-11 rounded-xl ${className}`} />;
}

/** A labelled form field (label line over a `field`-sized block). */
export function FieldBone({ label = "w-20", className = "" }: { label?: string; className?: string }) {
  return (
    <span className={`grid gap-1 ${className}`}>
      <Bone className={`h-4 ${label}`} />
      <Bone className="h-11 w-full rounded-xl" />
    </span>
  );
}

const MEAL_DAYS = 7;

/** The meal planner's week: navigation row, then a card per day with three meals. */
export function MealPlannerSkeleton() {
  return (
    <SkeletonRegion label="Loading the meal plan…" className="@container grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <ButtonBone className="w-24" />
        <Bone className="h-4 w-48 max-sm:hidden" />
        <ButtonBone className="w-24" />
      </div>
      <div className="grid gap-3 @min-[40rem]:grid-cols-2 @min-[60rem]:grid-cols-3">
        {Array.from({ length: MEAL_DAYS }, (_, d) => (
          <div key={d} className="card grid gap-3">
            <Bone className="h-5 w-28" />
            {[0, 1, 2].map((m) => (
              <div key={m} className="grid gap-1.5">
                <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2 @min-[40rem]:grid-cols-1 @min-[40rem]:gap-1">
                  <Bone className="h-4 w-20" />
                  <Bone className="h-11 rounded-xl" />
                </div>
                <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2 @min-[40rem]:grid-cols-1 @min-[40rem]:gap-1">
                  <Bone className="h-3 w-12" />
                  <Bone className="h-8 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** The shopping list: the hint, the add row, then an aisle heading with a few items. */
export function ShoppingListSkeleton() {
  return (
    <SkeletonRegion label="Loading the shopping list…" className="grid gap-3">
      <Bone className="h-4 w-full max-w-md" />
      <div className="flex gap-2">
        <Bone className="h-11 min-w-0 flex-1 rounded-xl" />
        <ButtonBone className="w-16" />
        <ButtonBone className="w-16" />
      </div>
      <div className="grid gap-3">
        {[4, 2].map((rows, g) => (
          <div key={g} className="grid gap-1">
            <Bone className="h-3 w-20" />
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex min-h-11 items-center gap-3 py-2">
                <Bone className="h-5 w-5 shrink-0 rounded-md" />
                <Bone className={`h-4 ${["w-24", "w-36", "w-20", "w-28"][i % 4]}`} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** Notes on the message board, inside its two-column grid. */
export function MessageNotesSkeleton() {
  return (
    <>
      <span className="sr-only" role="status">
        Loading the board…
      </span>
      {[0, 1].map((i) => (
        <div key={i} aria-hidden="true" className="flex min-h-32 flex-col gap-2 rounded-2xl border border-line bg-panel p-4 shadow-sm">
          <Bone className="h-4 w-4/5" />
          <Bone className="h-4 w-3/5" />
          <Bone className="mt-auto h-3 w-2/5" />
          <Bone className="h-9 w-16" />
        </div>
      ))}
    </>
  );
}

/** Upcoming family events, as list items. */
export function FamilyEventsSkeleton() {
  return (
    <>
      <li className="sr-only" role="status">
        Loading events…
      </li>
      {[0, 1].map((i) => (
        <li key={i} aria-hidden="true" className="card grid gap-1.5 p-3" style={{ borderLeft: "4px solid var(--color-line)" }}>
          <Bone className="h-5 w-40" />
          <Bone className="h-4 w-28" />
        </li>
      ))}
    </>
  );
}

/** The kids' chore page before anyone picks their name. */
export function KidsChoresSkeleton() {
  return (
    <SkeletonRegion label="Loading chores…" className="grid gap-3">
      <Bone className="h-4 w-28" />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card flex min-h-24 flex-col items-center justify-center gap-2">
            <Bone className="h-9 w-9 rounded-full" />
            <Bone className="h-4 w-16" />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** Display rows on the Displays tab. */
export function DisplaysSkeleton() {
  return (
    <SkeletonRegion label="Loading displays…" className="grid gap-3">
      {[0, 1].map((i) => (
        <div key={i} className="grid gap-2 rounded-xl border border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <Bone className="h-5 w-32" />
            <Bone className="h-4 w-20" />
          </div>
          <Bone className="h-11 rounded-xl" />
          <div className="flex flex-wrap gap-2">
            <ButtonBone className="w-28" />
            <ButtonBone className="w-24" />
          </div>
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** A library album's photo count and thumbnail grid. */
export function PhotoGridSkeleton() {
  return (
    <SkeletonRegion label="Loading photos…" className="grid gap-2">
      <Bone className="h-4 w-20" />
      <div className="grid grid-cols-4 gap-1 sm:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Bone key={i} className={`aspect-square rounded-md ${i >= 4 ? "max-sm:hidden" : ""}`} />
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** A select that's waiting for its choices (teams, speakers). */
export function SelectSkeleton({ label }: { label: string }) {
  return (
    <SkeletonRegion label={label}>
      <FieldBone label="w-14" />
    </SkeletonRegion>
  );
}

/** Page header shared by the family and kitchen edit pages: the mark, a title and the buttons on the right. */
export function PageHeaderSkeleton({ buttons = 2 }: { buttons?: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-3">
        <Bone className="h-8 w-8 rounded-[0.6rem]" />
        <Bone className="h-6 w-24" />
      </div>
      <div className="flex shrink-0 gap-2">
        {Array.from({ length: buttons }, (_, i) => (
          <ButtonBone key={i} className="w-24" />
        ))}
      </div>
    </div>
  );
}

/** The message board's form: from, the note, colours, then keep-it beside Post. */
export function MessageFormSkeleton() {
  return (
    <div className="card grid gap-3 p-4">
      <FieldBone label="w-12" />
      <Bone className="h-24 rounded-xl" />
      <div className="flex gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Bone key={i} className="h-11 w-11 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Bone className="h-11 rounded-xl" />
        <ButtonBone className="w-40" />
      </div>
    </div>
  );
}

/** The family and kitchen edit pages (`FamilyHome`): header, the tab bar, then the Notes tab. */
export function FamilyHomeSkeleton({ buttons = 1, subtitle = false }: { buttons?: number; subtitle?: boolean }) {
  return (
    <div aria-busy="true" className="min-h-dvh">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <Bone className="h-8 w-8 rounded-[0.6rem]" />
          <div className="grid gap-1.5">
            <Bone className="h-6 w-24" />
            {subtitle ? <Bone className="h-4 w-44" /> : null}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {Array.from({ length: buttons }, (_, i) => (
            <ButtonBone key={i} className="w-28" />
          ))}
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-panel sm:static sm:mt-3 sm:border-t-0 sm:border-b">
        <div className="mx-auto grid h-16 max-w-xl grid-cols-5 items-center justify-items-center sm:h-12">
          {[0, 1, 2, 3, 4].map((i) => (
            <Bone key={i} className="h-4 w-14" />
          ))}
        </div>
      </div>
      <div className="mx-auto grid w-full max-w-xl gap-4 p-4">
        <HeadingBone className="w-44" />
        <MessageFormSkeleton />
        <div className="grid gap-3 sm:grid-cols-2">
          <MessageNotesSkeleton />
        </div>
      </div>
    </div>
  );
}

/** A section heading. */
export function HeadingBone({ className = "w-32" }: { className?: string }) {
  return <Bone className={`h-6 ${className}`} />;
}
