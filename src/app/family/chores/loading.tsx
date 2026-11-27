import { KidsChoresSkeleton, PageHeaderSkeleton } from "@/components/Skeleton";

// Shown while the chores page checks the sign-in (Melvin, 2026-11-27: skeletons while a page loads).
export default function FamilyChoresLoading() {
  return (
    <main className="mx-auto grid max-w-xl gap-4 p-4">
      <PageHeaderSkeleton />
      <KidsChoresSkeleton />
    </main>
  );
}
