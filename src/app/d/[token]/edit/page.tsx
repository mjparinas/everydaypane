import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FamilyAuthProvider } from "@/components/FamilyAuth";
import { FamilyHome, MoreSection } from "@/components/FamilyHome";
import { FamilyPhotos } from "@/components/FamilyPhotos";
import { Whiteboard } from "@/components/Whiteboard";
import { deviceForToken } from "@/server/devices";

export const metadata: Metadata = { title: "Edit · Everydaypane" };

// Kitchen phone page (Melvin, 2026-11-22): open `/d/<token>/edit/` (or scan the edit QR) to change meals, shopping
// and the message board with no magic-link sign-in. Auth is knowing this display's secret address. Same tabs as the
// family page (`FamilyHome`, Melvin, 2026-11-28); the family calendar needs a sign-in, so it isn't here.
export default async function DisplayEditPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const device = await deviceForToken(token);
  if (!device) notFound();

  return (
    <FamilyAuthProvider displayToken={token}>
      <FamilyHome
        title="Edit"
        subtitle={`${device.name} · no sign-in needed`}
        more={
          <>
            <MoreSection id="whiteboard-heading" title="Whiteboard">
              <Whiteboard />
            </MoreSection>
            <FamilyPhotos />
            <MoreSection id="link-heading" title="About This Link">
              <p className="text-sm text-soft">
                Anyone who can open this link can change the meal plan, shopping list, notes and whiteboard, and add photos to albums open
                to the family. Keep the QR on the wall, not shared online.
              </p>
            </MoreSection>
          </>
        }
      />
    </FamilyAuthProvider>
  );
}
