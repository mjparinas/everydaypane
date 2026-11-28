import { Bone, MessageFormSkeleton, MessageNotesSkeleton, PageHeaderSkeleton } from "@/components/Skeleton";

// Shown while the app home checks the sign-in (Melvin, 2026-11-27: skeletons while a page loads). Same shape as the
// Notes tab: three quick actions, the note form and the notes, with the tab bar along the bottom.
export default function AppLoading() {
  return (
    <div aria-busy="true" className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-xl px-4 pt-3">
        <PageHeaderSkeleton />
      </div>
      <main className="mx-auto grid w-full max-w-xl gap-4 p-4">
        <div className="grid grid-cols-3 gap-2">
          <Bone className="h-24 rounded-2xl" />
          <Bone className="h-24 rounded-2xl" />
          <Bone className="h-24 rounded-2xl" />
        </div>
        <MessageFormSkeleton />
        <MessageNotesSkeleton />
      </main>
      <div className="fixed inset-x-0 bottom-0 h-16 border-t border-line bg-panel" />
    </div>
  );
}
