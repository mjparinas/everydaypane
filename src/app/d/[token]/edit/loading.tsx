import { Bone, MessageFormSkeleton, MessageNotesSkeleton } from "@/components/Skeleton";
import { Mark } from "@/components/Wordmark";

// Shown while the kitchen edit page checks its display link (Melvin, 2026-11-27: skeletons while a page loads). The
// page opens on its first tab, the message board, with the tab bar along the bottom on a phone (FamilyHub).
export default function DisplayEditLoading() {
  return (
    <main aria-busy="true" className="mx-auto grid max-w-5xl gap-4 p-4 pb-28 md:pb-8">
      <div className="flex items-center gap-3">
        <Mark size={32} />
        <div className="grid gap-1.5">
          <Bone className="h-6 w-28" />
          <Bone className="h-4 w-44" />
        </div>
      </div>
      <div className="hidden md:block">
        <Bone className="h-11 w-full" />
      </div>
      <div className="mx-auto grid w-full max-w-xl gap-4">
        <MessageFormSkeleton />
        <div className="grid gap-3">
          <MessageNotesSkeleton />
        </div>
      </div>
      <Bone className="fixed inset-x-0 bottom-0 h-14 rounded-none md:hidden" />
    </main>
  );
}
