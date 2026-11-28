import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DeleteAccount } from "@/components/DeleteAccount";
import { FamilyEvents } from "@/components/FamilyEvents";
import { FamilyHome, MoreSection } from "@/components/FamilyHome";
import { FamilyPhotos } from "@/components/FamilyPhotos";
import { InstallPrompt } from "@/components/InstallPrompt";
import { NativeAppBridge, ThisPhoneCard } from "@/components/NativeApp";
import { Whiteboard } from "@/components/Whiteboard";
import { currentHouseholdSession, SESSION_COOKIE } from "@/server/auth";

import { SignOut } from "./SignOut";

export const metadata: Metadata = { title: "Family" };

// The family's page (FAMILY_EMAILS), made for a phone: notes to the wall, shopping, meals and chores one tab at a time,
// and the whiteboard, photos, the family calendar and the account under More (`FamilyHome`, Melvin, 2026-11-28).
export default async function FamilyPage() {
  const session = await currentHouseholdSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect("/signin/?next=/family/");
  return (
    <>
      <NativeAppBridge />
      <FamilyHome
        title="Family"
        actions={
          session.role === "admin" ? (
            <a className="btn-ghost px-3" href="/household/">
              Household
            </a>
          ) : null
        }
        more={
          <>
            <FamilyEvents />
            <MoreSection id="whiteboard-heading" title="Whiteboard">
              <Whiteboard />
            </MoreSection>
            <FamilyPhotos />
            <ThisPhoneCard />
            <InstallPrompt />
            <MoreSection id="account-heading" title="Account">
              <div className="flex flex-wrap gap-2">
                <SignOut />
              </div>
            </MoreSection>
            <DeleteAccount />
          </>
        }
      />
    </>
  );
}
