import { Bone, ButtonBone, SkeletonRegion } from "@/components/Skeleton";
import { Mark } from "@/components/Wordmark";

// Shown while the household page loads its settings on the server (Melvin, 2026-11-27: skeletons while a page
// loads). Same header, five destinations and Views layout as the real page, so nothing moves when it arrives.
export default function HouseholdLoading() {
  return (
    <SkeletonRegion label="Loading your household…" className="min-h-dvh pb-24 md:pb-8">
      <div className="sticky top-0 z-20 border-b border-line bg-panel/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <Mark size={36} />
            <div className="grid gap-1.5">
              <Bone className="h-5 w-36" />
              <Bone className="h-3 w-44" />
            </div>
          </div>
          <ButtonBone className="w-36 max-sm:hidden" />
        </div>
        <div className="mx-auto hidden max-w-7xl gap-1 px-4 md:flex">
          {["Views", "Colours", "Displays", "Family", "Settings"].map((t) => (
            <span key={t} className="px-3 py-2 text-sm font-medium text-soft">
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl gap-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <ButtonBone className="w-24" />
          <ButtonBone className="w-28" />
          <ButtonBone className="w-20" />
          <ButtonBone className="w-28" />
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <Bone className="h-4 w-14" />
            <Bone className="h-9 w-40 rounded-xl" />
          </div>
          <Bone className="aspect-video w-full rounded-2xl" />
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] md:hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="grid min-h-14 place-items-center">
            <Bone className="h-8 w-10" />
          </span>
        ))}
      </div>
    </SkeletonRegion>
  );
}
