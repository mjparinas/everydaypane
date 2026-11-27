import {
  Bone,
  HeadingBone,
  MealPlannerSkeleton,
  MessageFormSkeleton,
  MessageNotesSkeleton,
  ShoppingListSkeleton,
  WhiteboardSkeleton,
} from "@/components/Skeleton";
import { Mark } from "@/components/Wordmark";

// Shown while the kitchen edit page checks its display link (Melvin, 2026-11-27: skeletons while a page loads).
export default function DisplayEditLoading() {
  return (
    <main aria-busy="true" className="mx-auto grid max-w-5xl gap-4 p-4">
      <div className="flex items-center gap-3">
        <Mark size={32} />
        <div className="grid gap-1.5">
          <h1 className="text-xl font-bold">Edit</h1>
          <Bone className="h-4 w-44" />
        </div>
      </div>
      <Bone className="h-4 w-full max-w-xl" />
      <Bone className="h-4 w-24" />
      <div className="mx-auto grid w-full max-w-xl gap-3">
        <HeadingBone />
        <div className="grid gap-4">
          <MessageFormSkeleton />
          <div className="grid gap-3 sm:grid-cols-2">
            <MessageNotesSkeleton />
          </div>
        </div>
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
