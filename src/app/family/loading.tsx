import { FamilyHomeSkeleton } from "@/components/Skeleton";

// Shown while the family page checks the sign-in (Melvin, 2026-11-27: skeletons while a page loads), shaped like its
// first tab, Notes.
export default function FamilyLoading() {
  return <FamilyHomeSkeleton />;
}
