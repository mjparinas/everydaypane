import {
  FamilyEventsSkeleton,
  HeadingBone,
  MealPlannerSkeleton,
  MessageFormSkeleton,
  MessageNotesSkeleton,
  PageHeaderSkeleton,
  ShoppingListSkeleton,
  WhiteboardSkeleton,
} from "@/components/Skeleton";

// Shown while the family page checks the sign-in (Melvin, 2026-11-27: skeletons while a page loads). Same order as
// the page: board, events, whiteboard, meals, shopping.
export default function FamilyLoading() {
  return (
    <main aria-busy="true" className="mx-auto grid max-w-5xl gap-4 p-4">
      <PageHeaderSkeleton />
      <div className="mx-auto grid w-full max-w-xl gap-4">
        <div className="grid gap-4">
          <MessageFormSkeleton />
          <div className="grid gap-3 sm:grid-cols-2">
            <MessageNotesSkeleton />
          </div>
        </div>
        <ul className="grid gap-2">
          <FamilyEventsSkeleton />
        </ul>
      </div>
      <div className="mx-auto grid w-full max-w-xl gap-3">
        <HeadingBone />
        <WhiteboardSkeleton />
      </div>
      <div className="grid gap-3">
        <HeadingBone />
        <MealPlannerSkeleton />
      </div>
      <div className="mx-auto grid w-full max-w-xl gap-3">
        <HeadingBone />
        <ShoppingListSkeleton />
      </div>
    </main>
  );
}
