import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, sessionFor } from "@/server/auth";
import { isStaffEmail, staffEnabled } from "@/server/staff";

import { PlatformAdmin } from "./_ui/PlatformAdmin";

export const metadata: Metadata = { title: "Admin" };

/**
 * Platform ops (/admin/), reserved like Tuned and Liftsmith. Household settings are /household/.
 * Old /admin bookmarks for a household admin who is not staff land on /household/.
 */
export default async function PlatformAdminPage() {
  if (!staffEnabled()) redirect("/household/");
  const session = await sessionFor((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect("/signin/?next=/admin/");
  if (!isStaffEmail(session.email)) {
    redirect(session.role === "admin" ? "/household/" : "/family/");
  }
  return <PlatformAdmin email={session.email} />;
}
