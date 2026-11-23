import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, sessionFor } from "@/server/auth";
import { loadConfig } from "@/server/config";
import { isStaffEmail } from "@/server/staff";

import { Admin } from "./_ui/Admin";

export const metadata: Metadata = { title: "Household" };

export default async function HouseholdPage() {
  const session = await sessionFor((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect("/signin/?next=/household/");
  if (session.role !== "admin") redirect("/family/");
  const { config, version } = await loadConfig(session.accountId);
  return <Admin initial={config} version={version} email={session.email} staff={isStaffEmail(session.email)} />;
}
