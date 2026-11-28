import { FamilyHomeSkeleton } from "@/components/Skeleton";

// Shown while the kitchen edit page checks its display link (Melvin, 2026-11-27: skeletons while a page loads), shaped
// like its first tab, Notes.
export default function DisplayEditLoading() {
  return <FamilyHomeSkeleton buttons={0} subtitle />;
}
