import { Bone, KidsChoresSkeleton } from "@/components/Skeleton";
import { Mark } from "@/components/Wordmark";

// Shown while the kids' chores page checks its display link (Melvin, 2026-11-27: skeletons while a page loads).
export default function DisplayChoresLoading() {
  return (
    <main className="mx-auto grid max-w-xl gap-4 p-4">
      <div className="flex items-center gap-3">
        <Mark size={32} />
        <div className="grid gap-1.5">
          <h1 className="text-xl font-bold">Chores</h1>
          <Bone className="h-4 w-44" />
        </div>
      </div>
      <Bone className="h-4 w-full" />
      <KidsChoresSkeleton />
    </main>
  );
}
